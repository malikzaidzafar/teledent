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


@router.post("", status_code=status.HTTP_201_CREATED)
def create_session(
    body: CreateSessionIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.core.exceptions import ForbiddenException, NotFoundException
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist

    # 1. Enforce roles allowed to access video sessions
    if current_user.role not in ("admin", "dentist", "patient"):
        raise ForbiddenException(f"Role '{current_user.role}' is not allowed here.")
    
    # 2. Get the appointment to check if user is a participant
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
    return {"session_id": str(session.id), "room_name": session.room_name}


@router.get("/{session_id}")
def get_session(session_id: str, _=Depends(get_current_user), db: Session = Depends(get_db)):
    return video_service.get_session(db, session_id)


@router.post("/{session_id}/token")
def get_token(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return video_service.get_token(db, session_id, current_user)


@router.post("/{session_id}/end", dependencies=[Depends(require_role("dentist"))])
def end_session(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    video_service.end_session(db, session_id, current_user.id)
    return {"message": "Session ended."}


@router.get("/{session_id}/recording")
def get_recording(session_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return video_service.get_recording(db, session_id, current_user)
