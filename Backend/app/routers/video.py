"""
routers/video.py — LiveKit video session endpoints.
"""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import video_service

router = APIRouter(prefix="/video/sessions", tags=["Video"])


class CreateSessionIn(BaseModel):
    appointment_id: str


class SaveNotesIn(BaseModel):
    notes: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.core.exceptions import ForbiddenException, NotFoundException
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.models.user import User
    from app.services import notification_service
    from app.routers.ws import manager

    if current_user.role not in ("admin", "dentist", "patient"):
        raise ForbiddenException(f"Role '{current_user.role}' is not allowed here.")

    appt = db.query(Appointment).filter(Appointment.id == body.appointment_id).first()
    if not appt:
        raise NotFoundException("Appointment", body.appointment_id)

    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or str(appt.patient_id) != str(patient.id):
            raise ForbiddenException("You are not a participant in this appointment.")
    elif current_user.role == "dentist":
        dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
        if not dentist or str(appt.dentist_id) != str(dentist.id):
            raise ForbiddenException("You are not a participant in this appointment.")

    session = video_service.create_session(db, body.appointment_id)

    # Notify ONLY the other participant — we are in an async context so await works correctly
    try:
        patient_record = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        dentist_record = db.query(Dentist).filter(Dentist.id == appt.dentist_id).first()
        if patient_record and dentist_record:
            patient_user = db.query(User).filter(User.id == patient_record.user_id).first()
            dentist_user = db.query(User).filter(User.id == dentist_record.user_id).first()
            if patient_user and dentist_user:
                patient_name = f"{patient_user.first_name} {patient_user.last_name}"
                dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}"
                if current_user.role == "dentist":
                    # Dentist is the caller → notify patient
                    notify_uid = str(patient_record.user_id)
                    caller_name = dentist_name
                else:
                    # Patient is the caller → notify dentist
                    notify_uid = str(dentist_record.user_id)
                    caller_name = patient_name
                await manager.send(notify_uid, {
                    "type": "incoming_call",
                    "session_id": str(session.id),
                    "appointment_id": str(body.appointment_id),
                    "caller_name": caller_name,
                    "caller_id": str(current_user.id),
                })
                notification_service.notify_call_started(
                    db, notify_uid, caller_name, str(body.appointment_id), str(session.id)
                )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to send call started notification: %s", exc)

    return {"session_id": str(session.id), "room_name": session.room_name}


@router.get("/by-appointment/{appointment_id}")
def get_session_by_appointment(
    appointment_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return an existing session for an appointment without creating one (used on page refresh)."""
    session = video_service.get_session_by_appointment(db, appointment_id, current_user)
    return {"session_id": str(session.id), "room_name": session.room_name}


@router.get("/{session_id}")
def get_session(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """G3: Restrict session access to participants only."""
    from app.core.exceptions import ForbiddenException
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist

    session = video_service.get_session(db, session_id)
    appt = db.query(Appointment).filter(Appointment.id == session.appointment_id).first()
    if appt and current_user.role != "admin":
        if current_user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
            if not patient or str(appt.patient_id) != str(patient.id):
                raise ForbiddenException("You are not a participant in this session.")
        elif current_user.role == "dentist":
            dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
            if not dentist or str(appt.dentist_id) != str(dentist.id):
                raise ForbiddenException("You are not a participant in this session.")
    return session


@router.post("/{session_id}/token")
def get_token(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return video_service.get_token(db, session_id, current_user)


@router.post("/{session_id}/end")
def end_session(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    video_service.end_session(db, session_id, current_user)
    return {"message": "Session ended."}


@router.post("/{session_id}/notes", dependencies=[Depends(require_role("dentist", "admin"))])
def save_notes(session_id: str, body: SaveNotesIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """F6: Persist clinical notes for the session."""
    return video_service.save_notes(db, session_id, body.notes, current_user)


@router.get("/{session_id}/recording")
def get_recording(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """G5: Ownership-checked recording endpoint."""
    return video_service.get_recording(db, session_id, current_user)


@router.post("/{session_id}/decline")
def decline_session(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Decline an incoming call — sets session status to declined and notifies caller."""
    from app.models.video_session import VideoSession, VideoSessionStatus
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.models.user import User
    from app.core.exceptions import ForbiddenException, NotFoundException
    from app.services import notification_service
    import asyncio

    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise NotFoundException("VideoSession", session_id)

    appt = db.query(Appointment).filter(Appointment.id == session.appointment_id).first()
    if appt and current_user.role != "admin":
        if current_user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
            if not patient or str(appt.patient_id) != str(patient.id):
                raise ForbiddenException("You are not a participant in this session.")
        elif current_user.role == "dentist":
            dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
            if not dentist or str(appt.dentist_id) != str(dentist.id):
                raise ForbiddenException("You are not a participant in this session.")

    session.status = VideoSessionStatus.declined
    db.commit()

    # Notify the other party (the caller) via WS + notification
    if appt:
        try:
            from app.routers.ws import manager
            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            dentist = db.query(Dentist).filter(Dentist.id == appt.dentist_id).first()
            # Determine who to notify (the other party)
            if current_user.role == "dentist" and patient:
                notify_uid = str(patient.user_id)
                decliner_user = db.query(User).filter(User.id == current_user.id).first()
                decliner_name = f"Dr. {decliner_user.first_name} {decliner_user.last_name}" if decliner_user else "Dentist"
            elif current_user.role == "patient" and dentist:
                notify_uid = str(dentist.user_id)
                decliner_user = db.query(User).filter(User.id == current_user.id).first()
                decliner_name = f"{decliner_user.first_name} {decliner_user.last_name}" if decliner_user else "Patient"
            else:
                notify_uid = None
                decliner_name = "participant"

            if notify_uid:
                event = {
                    "type": "call_declined",
                    "session_id": session_id,
                    "appointment_id": str(appt.id),
                    "decliner_name": decliner_name,
                }
                asyncio.get_event_loop().create_task(manager.send(notify_uid, event))
                notification_service.notify_call_missed(db, notify_uid, decliner_name, str(appt.id))
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Failed to notify call decline: %s", exc)

    return {"message": "Call declined."}
