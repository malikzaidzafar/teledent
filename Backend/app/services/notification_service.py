"""
services/notification_service.py — Create in-app Notification records (C1).
All appointment lifecycle transitions call these functions to create DB
notification rows that the frontend can poll (and eventually receive via SSE/WS).
"""
import uuid
import logging
from sqlalchemy.orm import Session
from app.models.notification import Notification

logger = logging.getLogger(__name__)


def _create(db: Session, user_id, type_: str, title: str, body: str, data: dict | None = None) -> Notification:
    notif = Notification(
        id=uuid.uuid4(),
        user_id=str(user_id),
        type=type_,
        title=title,
        body=body,
        data=data or {},
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def notify_appointment_booked(db: Session, patient_user_id, dentist_user_id, appointment_id: str, scheduled_at: str):
    """Patient books → notify both patient and dentist."""
    _create(
        db, patient_user_id,
        type_="appointment.booked",
        title="Appointment Booked",
        body=f"Your appointment for {scheduled_at} is pending confirmation.",
        data={"appointment_id": appointment_id},
    )
    _create(
        db, dentist_user_id,
        type_="appointment.new_request",
        title="New Appointment Request",
        body=f"A patient has requested an appointment for {scheduled_at}.",
        data={"appointment_id": appointment_id},
    )


def notify_appointment_confirmed(db: Session, patient_user_id, appointment_id: str, scheduled_at: str):
    """Dentist confirms → notify patient."""
    _create(
        db, patient_user_id,
        type_="appointment.confirmed",
        title="Appointment Confirmed",
        body=f"Your appointment for {scheduled_at} has been confirmed by your dentist.",
        data={"appointment_id": appointment_id},
    )


def notify_appointment_cancelled(db: Session, patient_user_id, dentist_user_id, appointment_id: str, cancelled_by: str):
    """Cancellation/rejection → notify both parties."""
    _create(
        db, patient_user_id,
        type_="appointment.cancelled",
        title="Appointment Cancelled",
        body=f"Your appointment was cancelled by {cancelled_by}.",
        data={"appointment_id": appointment_id},
    )
    _create(
        db, dentist_user_id,
        type_="appointment.cancelled",
        title="Appointment Cancelled",
        body=f"Appointment was cancelled by {cancelled_by}.",
        data={"appointment_id": appointment_id},
    )


def notify_appointment_completed(db: Session, patient_user_id, appointment_id: str):
    """Session ends / appointment marked complete → notify patient."""
    _create(
        db, patient_user_id,
        type_="appointment.completed",
        title="Consultation Complete",
        body="Your consultation is complete. Your report will be available shortly.",
        data={"appointment_id": appointment_id},
    )
