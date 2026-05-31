"""
models/report.py — Dentist-authored diagnosis report.
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Boolean, Date, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    dentist_id = Column(UUID(as_uuid=True), ForeignKey("dentists.id"), nullable=True)  # null for AI-generated
    is_auto_generated = Column(Boolean, default=False, nullable=False)
    dentist_notes = Column(String(5000))
    final_diagnosis = Column(String(500))
    recommended_actions = Column(JSONB, default=list)
    follow_up_date = Column(Date)
    pdf_url = Column(String)                                   # Cloudinary CDN URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    scan = relationship("Scan", back_populates="reports")
    patient = relationship("Patient", back_populates="reports")
    dentist = relationship("Dentist", back_populates="reports")
