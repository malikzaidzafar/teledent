"""
services/video_service.py — LiveKit room and token management.
"""
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.config import settings
from app.models.video_session import VideoSession, VideoSessionStatus
from app.core.exceptions import NotFoundException

try:
    from livekit.api import AccessToken, VideoGrants
    LIVEKIT_AVAILABLE = True
except ImportError:
    LIVEKIT_AVAILABLE = False


def _generate_livekit_token(room_name: str, participant_identity: str) -> str:
    if not LIVEKIT_AVAILABLE:
        return "livekit-stub-token"  # TODO: remove once livekit-api is installed
    token = AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
    token.identity = participant_identity
    token.name = participant_identity
    token.with_grants(VideoGrants(room=room_name, room_join=True))
    return token.to_jwt()


def create_session(db: Session, appointment_id: str) -> VideoSession:
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
    return session


def get_session(db: Session, session_id: str) -> VideoSession:
    session = db.query(VideoSession).filter(VideoSession.id == session_id).first()
    if not session:
        raise NotFoundException("VideoSession", session_id)
    return session


def get_token(db: Session, session_id: str, current_user) -> dict:
    session = get_session(db, session_id)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
    token = _generate_livekit_token(session.room_name, str(current_user.id))
    return {
        "token": token,
        "room_name": session.room_name,
        "livekit_url": settings.LIVEKIT_URL,
        "expires_at": expires_at.isoformat(),
    }


def end_session(db: Session, session_id: str, dentist_id: str):
    session = get_session(db, session_id)
    session.status = VideoSessionStatus.ended
    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    # TODO: call LiveKit API to close room


def get_recording(db: Session, session_id: str, current_user) -> dict:
    session = get_session(db, session_id)
    # TODO: check ownership / role
    if not session.recording_url:
        raise NotFoundException("Recording for session", session_id)
    return {"recording_url": session.recording_url}
