"""
models/notification.py — In-app notifications.
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(100), nullable=False)       # e.g. "scan.complete", "appointment.reminder"
    title = Column(String(255), nullable=False)      # TODO: imaginary
    body = Column(String(1000))                      # TODO: imaginary
    data = Column(JSONB, default=dict)               # TODO: imaginary — extra payload
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
