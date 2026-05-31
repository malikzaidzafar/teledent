"""
models/dentist.py — Dentist profile (1-to-1 with User where role=dentist).
TODO: replace imaginary fields.
"""
import uuid
from sqlalchemy import Column, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Dentist(Base):
    __tablename__ = "dentists"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    specialization = Column(String(200))       # TODO: imaginary
    license_number = Column(String(100))       # TODO: imaginary
    bio = Column(String(2000))                 # TODO: imaginary
    years_experience = Column(Float)           # TODO: imaginary
    is_approved = Column(Boolean, default=False)
    rating = Column(Float, default=0.0)        # TODO: imaginary
    review_count = Column(Float, default=0)    # TODO: imaginary
    schedule = Column(JSONB, default=dict)     # TODO: imaginary — weekly slot config
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="dentist_profile", uselist=False)
    appointments = relationship("Appointment", back_populates="dentist")
    reports = relationship("Report", back_populates="dentist")
