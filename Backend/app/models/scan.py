"""
models/scan.py — Dental scan uploaded to Cloudinary.
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Boolean, Date, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class ScanType(str, enum.Enum):
    panoramic = "panoramic"
    periapical = "periapical"
    bitewing = "bitewing"
    intraoral = "intraoral"


class ScanStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    complete = "complete"
    failed = "failed"


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    cloudinary_public_id = Column(String, nullable=False)   # TODO: imaginary
    cloudinary_url = Column(String, nullable=False)         # TODO: imaginary
    scan_type = Column(SAEnum(ScanType), nullable=False)
    scan_date = Column(Date, nullable=False)
    notes = Column(String(1000))                            # TODO: imaginary
    status = Column(SAEnum(ScanStatus), default=ScanStatus.queued, nullable=False)
    dentist_reviewed = Column(Boolean, default=False)
    ai_result = Column(JSONB)                               # TODO: imaginary — summary cache
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="scans")
    analysis = relationship("Analysis", back_populates="scan", uselist=False)
    reports = relationship("Report", back_populates="scan")
    appointments = relationship("Appointment", back_populates="scan")
