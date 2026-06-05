"""
services/video_service.py — LiveKit room and token management.
"""
import uuid
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.config import settings
from app.models.video_session import VideoSession, VideoSessionStatus
from app.core.exceptions import NotFoundException, ConflictException

logger = logging.getLogger(__name__)

try:
    from livekit.api import AccessToken, VideoGrants
    import livekit.api as _lk_api
    LIVEKIT_AVAILABLE = True
except ImportError:
    LIVEKIT_AVAILABLE = False
    logger.error(
        "livekit-api package not installed — video calling will NOT work. "
        "Run: pip install livekit-api"
    )


def _generate_livekit_token(room_name: str, participant_identity: str, display_name: str) -> str:
    """
    Generate a signed LiveKit JWT using the v1.x fluent builder API.
    Raises RuntimeError if livekit-api is not installed so the error
    propagates to the caller rather than silently returning a stub.
    """
    if not LIVEKIT_AVAILABLE:
        raise RuntimeError(
            "livekit-api is not installed on the backend. "
            "Run `pip install livekit-api` and restart the server."
        )
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise RuntimeError(
            "LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in the environment."
        )
    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(participant_identity)
        .with_name(display_name)
        .with_ttl(timedelta(hours=2))
        .with_grants(VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        ))
    )
    return token.to_jwt()


async def _close_livekit_room(room_name: str):
    """F3: Close the LiveKit room via the REST API (v1.x async context-manager pattern)."""
    if not LIVEKIT_AVAILABLE:
        logger.warning("livekit-api not available — cannot close room %s", room_name)
        return
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        logger.warning("LiveKit credentials not configured — skipping room close for %s", room_name)
        return
    try:
        async with _lk_api.LiveKitAPI(
            settings.LIVEKIT_URL,
            settings.LIVEKIT_API_KEY,
            settings.LIVEKIT_API_SECRET,
        ) as lk:
            await lk.room.delete_room(_lk_api.DeleteRoomRequest(room=room_name))
        logger.info("LiveKit room '%s' closed.", room_name)
    except Exception as exc:
        logger.error("Failed to close LiveKit room '%s': %s", room_name, exc)


def create_session(db: Session, appointment_id: str):
    """Returns (VideoSession, is_new: bool). is_new=False when session already existed."""
    from app.models.appointment import Appointment, AppointmentStatus
    from app.core.exceptions import ConflictException

    # D2: Only allow session creation for confirmed appointments
    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appt:
        raise NotFoundException("Appointment", appointment_id)
    if appt.status != AppointmentStatus.confirmed:
        raise ConflictException(
            f"Cannot start a video session for an appointment with status '{appt.status.value}'. "
            "The appointment must be confirmed first."
        )

    # Check if a session already exists for this appointment
    existing = db.query(VideoSession).filter(VideoSession.appointment_id == appointment_id).first()
    if existing:
        # D6: Do NOT silently re-activate an ended session
        if existing.status == VideoSessionStatus.ended:
            raise ConflictException(
                "This video session has already ended. Contact support to re-open the appointment."
            )
        return existing, False  # already existed — do NOT re-send notification

    room_name = f"teledent-{appointment_id}"
    session = VideoSession(
        id=uuid.uuid4(),
        appointment_id=appointment_id,
        room_name=room_name,
        status=VideoSessionStatus.active,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, True  # newly created — send notification


def get_session(db: Session, session_id: str) -> VideoSession:
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise NotFoundException("VideoSession", session_id)
    return session


def get_session_by_appointment(db: Session, appointment_id: str, current_user) -> VideoSession:
    """Look up an existing session by appointment_id without creating one."""
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.core.exceptions import ForbiddenException

    session = db.query(VideoSession).filter(VideoSession.appointment_id == appointment_id).first()
    if not session:
        raise NotFoundException("VideoSession for appointment", appointment_id)

    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if appt and current_user.role != "admin":
        if current_user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
            if not patient or str(appt.patient_id) != str(patient.id):
                raise ForbiddenException("You are not a participant in this appointment.")
        elif current_user.role == "dentist":
            dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
            if not dentist or str(appt.dentist_id) != str(dentist.id):
                raise ForbiddenException("You are not a participant in this appointment.")
    return session


def get_token(db: Session, session_id: str, current_user) -> dict:
    session = get_session(db, session_id)

    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.models.user import User
    from app.core.exceptions import ForbiddenException

    appt = db.query(Appointment).filter(Appointment.id == session.appointment_id).first()
    if not appt:
        raise NotFoundException("Appointment", str(session.appointment_id))

    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or str(appt.patient_id) != str(patient.id):
            raise ForbiddenException("You are not a participant in this video session.")
    elif current_user.role == "dentist":
        dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
        if not dentist or str(appt.dentist_id) != str(dentist.id):
            raise ForbiddenException("You are not a participant in this video session.")
    elif current_user.role != "admin":
        raise ForbiddenException("Access denied.")

    # Resolve display name for the LiveKit participant label
    user_record = db.query(User).filter(User.id == current_user.id).first()
    if user_record:
        if current_user.role == "dentist":
            display_name = f"Dr. {user_record.first_name} {user_record.last_name}"
        else:
            display_name = f"{user_record.first_name} {user_record.last_name}"
    else:
        display_name = str(current_user.id)

    participant_identity = str(current_user.id)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
    token = _generate_livekit_token(session.room_name, participant_identity, display_name)

    return {
        "token": token,
        "room_name": session.room_name,
        "livekit_url": settings.LIVEKIT_URL,
        "expires_at": expires_at.isoformat(),
        "identity": participant_identity,
        "display_name": display_name,
    }


def end_session(db: Session, session_id: str, current_user):
    session = get_session(db, session_id)

    # Verify caller is a participant of this session
    from app.models.appointment import Appointment, AppointmentStatus
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.core.exceptions import ForbiddenException

    appt = db.query(Appointment).filter(Appointment.id == session.appointment_id).first()
    if appt:
        if current_user.role == "patient":
            patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
            if not patient or str(appt.patient_id) != str(patient.id):
                raise ForbiddenException("You are not a participant in this video session.")
        elif current_user.role == "dentist":
            dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
            if not dentist or str(appt.dentist_id) != str(dentist.id):
                raise ForbiddenException("You are not a participant in this video session.")
        # admin can always end

    session.status = VideoSessionStatus.ended
    session.ended_at = datetime.now(timezone.utc)

    # F4: Auto-complete the appointment when the session ends
    if appt and appt.status == AppointmentStatus.confirmed:
        appt.status = AppointmentStatus.completed

    db.commit()

    # F3: Close LiveKit room asynchronously (best-effort)
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_close_livekit_room(session.room_name))
        else:
            loop.run_until_complete(_close_livekit_room(session.room_name))
    except Exception as exc:
        logger.warning("Could not schedule LiveKit room closure: %s", exc)


def save_notes(db: Session, session_id: str, notes: str, current_user) -> dict:
    """F6: Persist clinical notes written by dentist during the session."""
    session = get_session(db, session_id)

    from app.models.appointment import Appointment
    from app.models.dentist import Dentist
    from app.core.exceptions import ForbiddenException

    appt = db.query(Appointment).filter(Appointment.id == session.appointment_id).first()
    if not appt:
        raise NotFoundException("Appointment", str(session.appointment_id))

    # Only dentist who owns the appointment can save notes
    if current_user.role == "dentist":
        dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
        if not dentist or str(appt.dentist_id) != str(dentist.id):
            raise ForbiddenException("You do not own this appointment.")
    elif current_user.role != "admin":
        raise ForbiddenException("Only the dentist can save session notes.")

    if hasattr(appt, "notes"):
        appt.notes = notes
        db.commit()

    return {"message": "Notes saved.", "notes": notes}


def get_recording(db: Session, session_id: str, current_user) -> dict:
    session = get_session(db, session_id)
    # G5: Check ownership
    from app.models.appointment import Appointment
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.core.exceptions import ForbiddenException

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

    if not session.recording_url:
        raise NotFoundException("Recording for session", session_id)
    return {"recording_url": session.recording_url}
