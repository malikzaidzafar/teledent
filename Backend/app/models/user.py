"""
models/user.py — Base user for auth. All roles share this table.
TODO: replace imaginary fields with real ones after schema finalization.
"""
import uuid
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    patient = "patient"
    dentist = "dentist"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    # TODO: finalize field set
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    first_name = Column(String(100), nullable=False)          # TODO: imaginary
    last_name = Column(String(100), nullable=False)           # TODO: imaginary
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.patient)
    is_active = Column(Boolean, default=True, nullable=False)
    is_email_verified = Column(Boolean, default=False)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
