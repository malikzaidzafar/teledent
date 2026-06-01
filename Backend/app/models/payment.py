"""
models/payment.py — Stripe payment record per appointment.
"""
import uuid
import enum
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False, unique=True)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)

    # Stripe fields
    stripe_payment_intent_id = Column(String, nullable=True, index=True)
    stripe_client_secret = Column(String, nullable=True)

    amount_cents = Column(Integer, nullable=False)     # e.g. 2500 = $25.00
    currency = Column(String(10), default="usd")
    status = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    appointment = relationship("Appointment", backref="payment", uselist=False)
    patient = relationship("Patient", backref="payments")
