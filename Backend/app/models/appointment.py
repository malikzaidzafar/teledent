"""
models/appointment.py — Scheduled consultation between patient and dentist.
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class AppointmentType(str, enum.Enum):
    video_consultation = "video_consultation"
    in_person = "in_person"


class AppointmentStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
    no_show = "no_show"


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    dentist_id = Column(UUID(as_uuid=True), ForeignKey("dentists.id"), nullable=False)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=True)   # optional
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    duration_min = Column(Integer, default=30)                  # TODO: imaginary
    type = Column(SAEnum(AppointmentType), nullable=False)
    status = Column(SAEnum(AppointmentStatus), default=AppointmentStatus.pending)
    join_url = Column(String)                                   # LiveKit room URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="appointments")
    dentist = relationship("Dentist", back_populates="appointments")
    scan = relationship("Scan", back_populates="appointments")
    video_session = relationship("VideoSession", back_populates="appointment", uselist=False)
