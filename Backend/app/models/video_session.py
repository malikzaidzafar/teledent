"""
models/video_session.py — LiveKit room session.
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class VideoSessionStatus(str, enum.Enum):
    active = "active"
    ended = "ended"


class VideoSession(Base):
    __tablename__ = "video_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"), unique=True, nullable=False)
    room_name = Column(String, unique=True, nullable=False)      # LiveKit room name
    livekit_room_sid = Column(String)                            # TODO: imaginary
    status = Column(SAEnum(VideoSessionStatus), default=VideoSessionStatus.active)
    recording_url = Column(String)                               # TODO: imaginary — Cloudinary
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True))

    appointment = relationship("Appointment", back_populates="video_session")
