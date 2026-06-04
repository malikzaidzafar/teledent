"""services/appointment_service.py — Booking, cancellation, completion."""
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.patient import Patient
from app.models.dentist import Dentist
from app.core.exceptions import NotFoundException, ConflictException, ForbiddenException, BadRequestException
from app.core.pagination import paginate


def _resolve_patient(db: Session, user_id: str) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise NotFoundException("Patient profile for user", user_id)
    return patient


def _check_slot_available(db: Session, dentist_id: str, scheduled_at: datetime, duration_min: int):
    """A1: Raise ConflictException if the dentist already has an overlapping appointment."""
    end_at = scheduled_at + timedelta(minutes=duration_min)
    overlap = (
        db.query(Appointment)
        .filter(
            Appointment.dentist_id == dentist_id,
            Appointment.status.in_([AppointmentStatus.pending, AppointmentStatus.confirmed]),
            Appointment.scheduled_at < end_at,
            (Appointment.scheduled_at + timedelta(minutes=30)) > scheduled_at,
        )
        .first()
    )
    if overlap:
        raise ConflictException("This time slot is already booked. Please choose another time.")


def create_appointment(db: Session, user_id: str, data: dict) -> Appointment:
    patient = _resolve_patient(db, user_id)
    # A9: Validate dentist exists before booking
    dentist = db.query(Dentist).filter(Dentist.id == data["dentist_id"]).first()
    if not dentist:
        raise NotFoundException("Dentist", str(data["dentist_id"]))

    # A5: Scheduled time must be in the future
    scheduled_at = data["scheduled_at"]
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    if scheduled_at <= datetime.now(timezone.utc):
        raise BadRequestException("Appointment must be scheduled in the future.")

    # A6: Validate appointment type
    raw_type = data.get("type", "video_consultation").lower().replace(" ", "_")
    valid_types = {t.value for t in AppointmentType}
    if raw_type not in valid_types:
        raise BadRequestException(f"Invalid appointment type '{raw_type}'. Must be one of: {', '.join(valid_types)}.")

    _check_slot_available(db, data["dentist_id"], scheduled_at, data.get("duration_min", 30))

    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        dentist_id=data["dentist_id"],
        scan_id=data.get("scan_id"),
        scheduled_at=scheduled_at,
        duration_min=data.get("duration_min", 30),
        type=raw_type,
        status=AppointmentStatus.pending,
        join_url=None,  # A3: removed dead placeholder URL
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)

    # A4: Send booking emails and create DB notifications
    try:
        patient_user = db.query(User).filter(User.id == patient.user_id).first()
        dentist_user = db.query(User).filter(User.id == dentist.user_id).first()
        scheduled_str = scheduled_at.strftime("%A, %B %d at %I:%M %p UTC")
        dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}" if dentist_user else "your dentist"
        patient_name = f"{patient_user.first_name} {patient_user.last_name}" if patient_user else "Patient"
        if patient_user:
            email_service.send_appointment_booked_email(patient_user.email, patient_name, dentist_name, scheduled_str)
        if dentist_user:
            email_service.send_appointment_booked_dentist_email(dentist_user.email, dentist_name, patient_name, scheduled_str)
        notification_service.notify_appointment_booked(
            db, patient.user_id, dentist.user_id, str(appt.id), scheduled_str
        )
    except Exception as exc:
        logger.warning("Post-booking notification failed: %s", exc)

    return appt


def list_appointments(db: Session, user_id: str, role: str, page: int, limit: int):
    q = db.query(Appointment)
    if role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == user_id).first()
        if patient:
            q = q.filter(Appointment.patient_id == patient.id)
        else:
            return {"data": [], "total": 0, "page": page, "limit": limit, "pages": 0}
    elif role == "dentist":
        dentist = db.query(Dentist).filter(Dentist.user_id == user_id).first()
        if dentist:
            q = q.filter(Appointment.dentist_id == dentist.id)
        else:
            return {"data": [], "total": 0, "page": page, "limit": limit, "pages": 0}
    q = q.order_by(Appointment.scheduled_at.asc())
    return paginate(q, page, limit, schema=None)


def get_appointment(db: Session, appt_id: str, current_user) -> Appointment:
    appt = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not appt:
        raise NotFoundException("Appointment", appt_id)
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or str(appt.patient_id) != str(patient.id):
            raise ForbiddenException()
    return appt


def update_appointment(db: Session, appt_id: str, data: dict, current_user) -> Appointment:
    appt = get_appointment(db, appt_id, current_user)
    for field, value in data.items():
        setattr(appt, field, value)
    db.commit()
    db.refresh(appt)
    return appt


def cancel_appointment(db: Session, appt_id: str, current_user):
    appt = get_appointment(db, appt_id, current_user)
    # B6: Only allow cancellation of pending/confirmed appointments
    if appt.status not in (AppointmentStatus.pending, AppointmentStatus.confirmed):
        raise ConflictException(f"Cannot cancel an appointment with status '{appt.status.value}'.")
    appt.status = AppointmentStatus.cancelled
    db.commit()

    # Notify both parties
    try:
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        dentist = db.query(Dentist).filter(Dentist.id == appt.dentist_id).first()
        patient_user = db.query(User).filter(User.id == patient.user_id).first() if patient else None
        dentist_user = db.query(User).filter(User.id == dentist.user_id).first() if dentist else None
        scheduled_str = appt.scheduled_at.strftime("%A, %B %d at %I:%M %p UTC")
        cancelled_by = "the patient" if current_user.role == "patient" else "the dentist"
        dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}" if dentist_user else "Dentist"
        patient_name = f"{patient_user.first_name} {patient_user.last_name}" if patient_user else "Patient"
        if patient_user:
            email_service.send_appointment_cancelled_email(patient_user.email, patient_name, dentist_name, scheduled_str, cancelled_by)
        if dentist_user:
            email_service.send_appointment_cancelled_email(dentist_user.email, dentist_name, patient_name, scheduled_str, cancelled_by)
        if patient and dentist:
            notification_service.notify_appointment_cancelled(db, patient.user_id, dentist.user_id, str(appt.id), cancelled_by)
    except Exception as exc:
        logger.warning("Post-cancel notification failed: %s", exc)


def accept_appointment(db: Session, appt_id: str, dentist_user_id) -> Appointment:
    dentist = db.query(Dentist).filter(Dentist.user_id == dentist_user_id).first()
    if not dentist:
        raise NotFoundException("Dentist profile", str(dentist_user_id))
    appt = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not appt:
        raise NotFoundException("Appointment", appt_id)
    if str(appt.dentist_id) != str(dentist.id):
        raise ForbiddenException()
    if appt.status != AppointmentStatus.pending:
        raise ConflictException("Appointment is not in pending state.")
    appt.status = AppointmentStatus.confirmed
    db.commit()
    db.refresh(appt)

    # B2: Notify patient of confirmation
    try:
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        patient_user = db.query(User).filter(User.id == patient.user_id).first() if patient else None
        dentist_user = db.query(User).filter(User.id == dentist.user_id).first()
        scheduled_str = appt.scheduled_at.strftime("%A, %B %d at %I:%M %p UTC")
        dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}" if dentist_user else "your dentist"
        patient_name = f"{patient_user.first_name} {patient_user.last_name}" if patient_user else "Patient"
        if patient_user:
            email_service.send_appointment_confirmed_email(patient_user.email, patient_name, dentist_name, scheduled_str)
        if patient:
            notification_service.notify_appointment_confirmed(db, patient.user_id, str(appt.id), scheduled_str)
    except Exception as exc:
        logger.warning("Post-confirm notification failed: %s", exc)

    return appt


def reject_appointment(db: Session, appt_id: str, dentist_user_id: str, reason: str) -> Appointment:
    dentist = db.query(Dentist).filter(Dentist.user_id == dentist_user_id).first()
    if not dentist:
        raise NotFoundException("Dentist profile", str(dentist_user_id))
    appt = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not appt:
        raise NotFoundException("Appointment", appt_id)
    if str(appt.dentist_id) != str(dentist.id):
        raise ForbiddenException("You do not own this appointment.")
    if appt.status != AppointmentStatus.pending:
        raise ConflictException("Only pending appointments can be rejected.")
    appt.status = AppointmentStatus.cancelled
    # Store rejection reason in notes field if available, else we accept without it
    if hasattr(appt, "notes"):
        appt.notes = f"[Rejected by dentist] {reason}"
    db.commit()
    db.refresh(appt)

    # Notify patient of rejection
    try:
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        patient_user = db.query(User).filter(User.id == patient.user_id).first() if patient else None
        dentist_user = db.query(User).filter(User.id == dentist.user_id).first()
        scheduled_str = appt.scheduled_at.strftime("%A, %B %d at %I:%M %p UTC")
        dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}" if dentist_user else "Dentist"
        patient_name = f"{patient_user.first_name} {patient_user.last_name}" if patient_user else "Patient"
        if patient_user:
            email_service.send_appointment_cancelled_email(patient_user.email, patient_name, dentist_name, scheduled_str, "the dentist")
        if patient:
            notification_service.notify_appointment_cancelled(db, patient.user_id, dentist.user_id, str(appt.id), "the dentist")
    except Exception as exc:
        logger.warning("Post-reject notification failed: %s", exc)

    return appt


def complete_appointment(db: Session, appt_id: str, dentist_user_id: str):
    dentist = db.query(Dentist).filter(Dentist.user_id == dentist_user_id).first()
    if not dentist:
        raise NotFoundException("Dentist profile", str(dentist_user_id))
    appt = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not appt:
        raise NotFoundException("Appointment", appt_id)
    if str(appt.dentist_id) != str(dentist.id):
        raise ForbiddenException("You do not own this appointment.")
    if appt.status != AppointmentStatus.confirmed:
        raise ConflictException("Only confirmed appointments can be marked as completed.")
    appt.status = AppointmentStatus.completed
    db.commit()

    # Notify patient appointment is complete
    try:
        patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
        patient_user = db.query(User).filter(User.id == patient.user_id).first() if patient else None
        dentist_user = db.query(User).filter(User.id == dentist.user_id).first()
        dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}" if dentist_user else "Dentist"
        patient_name = f"{patient_user.first_name} {patient_user.last_name}" if patient_user else "Patient"
        if patient_user:
            email_service.send_appointment_completed_email(patient_user.email, patient_name, dentist_name)
        if patient:
            notification_service.notify_appointment_completed(db, patient.user_id, str(appt.id))
    except Exception as exc:
        logger.warning("Post-complete notification failed: %s", exc)
