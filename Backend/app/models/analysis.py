"""
models/analysis.py — AI analysis result for a scan (1-to-1 with Scan).
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class AnalysisStatus(str, enum.Enum):
    pending = "pending"
    complete = "complete"
    failed = "failed"


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), unique=True, nullable=False)
    status = Column(SAEnum(AnalysisStatus), default=AnalysisStatus.pending)
    confidence_score = Column(Float)
    findings = Column(JSONB, default=list)       # CNN+Gemini enriched findings list
    ai_explanation = Column(JSONB, default=dict) # Gemini patient-facing text & risk summary
    model_version = Column(String(50))
    processed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    scan = relationship("Scan", back_populates="analysis")
