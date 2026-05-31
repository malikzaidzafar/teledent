"""
models/patient.py — Patient profile (1-to-1 with User where role=patient).
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Date, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    phone = Column(String(20))                     # TODO: imaginary
    date_of_birth = Column(Date)                   # TODO: imaginary
    gender = Column(String(20))                    # TODO: imaginary
    address = Column(String(500))                  # TODO: imaginary
    medical_history = Column(JSONB, default=list)  # TODO: imaginary
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="patient_profile", uselist=False)
    scans = relationship("Scan", back_populates="patient", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="patient")
    reports = relationship("Report", back_populates="patient")