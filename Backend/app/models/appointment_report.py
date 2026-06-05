"""
models/appointment_report.py — Junction table linking shared reports to appointments.
Patients explicitly choose which reports to share with a dentist for a specific appointment.
"""
import uuid
from sqlalchemy import Column, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class AppointmentReport(Base):
    __tablename__ = "appointment_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    shared_at = Column(DateTime(timezone=True), server_default=func.now())

    appointment = relationship("Appointment", back_populates="shared_reports")
    report = relationship("Report")

    __table_args__ = (
        UniqueConstraint("appointment_id", "report_id", name="uq_appointment_report"),
    )
