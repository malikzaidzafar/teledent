"""
services/reminder_service.py — Appointment reminders, no-show detection.

Run this module as a background task or from an APScheduler/cron job.
Call run_reminders() periodically (e.g. every 5 minutes).
"""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def run_reminders(db: Session):
    """Send 1-hour and 15-minute reminders; detect no-shows."""
    from app.models.appointment import Appointment, AppointmentStatus
    from app.models.patient import Patient
    from app.models.dentist import Dentist
    from app.models.user import User
    from app.models.video_session import VideoSession
    from app.services import email_service, notification_service

    now = datetime.now(timezone.utc)
    one_hour_window_start = now + timedelta(minutes=55)
    one_hour_window_end = now + timedelta(minutes=65)
    fifteen_min_window_start = now + timedelta(minutes=10)
    fifteen_min_window_end = now + timedelta(minutes=20)
    noshow_cutoff = now - timedelta(minutes=15)

    confirmed = db.query(Appointment).filter(
        Appointment.status == AppointmentStatus.confirmed,
    ).all()

    for appt in confirmed:
        scheduled = appt.scheduled_at
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)

        try:
            patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
            dentist = db.query(Dentist).filter(Dentist.id == appt.dentist_id).first()
            patient_user = db.query(User).filter(User.id == patient.user_id).first() if patient else None
            dentist_user = db.query(User).filter(User.id == dentist.user_id).first() if dentist else None
            if not patient_user or not dentist_user:
                continue

            scheduled_str = scheduled.strftime("%A, %B %d at %I:%M %p UTC")
            patient_name = f"{patient_user.first_name} {patient_user.last_name}"
            dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}"

            # 1-hour reminder
            if one_hour_window_start <= scheduled <= one_hour_window_end:
                notification_service._create(
                    db, str(patient.user_id),
                    type_="appointment.reminder",
                    title="Appointment in 1 Hour",
                    body=f"Your consultation with {dentist_name} is in 1 hour ({scheduled_str}).",
                    data={"appointment_id": str(appt.id)},
                )
                notification_service._create(
                    db, str(dentist.user_id),
                    type_="appointment.reminder",
                    title="Appointment in 1 Hour",
                    body=f"Your consultation with {patient_name} is in 1 hour ({scheduled_str}).",
                    data={"appointment_id": str(appt.id)},
                )
                try:
                    email_service.send_appointment_reminder_email(
                        patient_user.email, patient_name, dentist_name, scheduled_str, "1 hour"
                    )
                except Exception as exc:
                    logger.warning("Email reminder failed: %s", exc)

            # 15-minute reminder
            elif fifteen_min_window_start <= scheduled <= fifteen_min_window_end:
                notification_service._create(
                    db, str(patient.user_id),
                    type_="appointment.reminder",
                    title="Appointment in 15 Minutes",
                    body=f"Your consultation with {dentist_name} starts in 15 minutes.",
                    data={"appointment_id": str(appt.id)},
                )
                notification_service._create(
                    db, str(dentist.user_id),
                    type_="appointment.reminder",
                    title="Appointment in 15 Minutes",
                    body=f"Your consultation with {patient_name} starts in 15 minutes.",
                    data={"appointment_id": str(appt.id)},
                )

            # No-show detection: appointment time has passed + 15min, no video session
            elif scheduled < noshow_cutoff:
                has_session = db.query(VideoSession).filter(
                    VideoSession.appointment_id == appt.id
                ).first()
                if not has_session:
                    appt.status = AppointmentStatus.no_show
                    db.commit()
                    notification_service._create(
                        db, str(patient.user_id),
                        type_="appointment.no_show",
                        title="Appointment Missed",
                        body=f"Your appointment with {dentist_name} was marked as missed.",
                        data={"appointment_id": str(appt.id)},
                    )
                    logger.info("Appointment %s marked as no-show", appt.id)

        except Exception as exc:
            logger.error("Reminder processing failed for appointment %s: %s", appt.id, exc)
