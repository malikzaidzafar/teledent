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


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin", "dentist"))])
def create_session(body: CreateSessionIn, db: Session = Depends(get_db)):
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
