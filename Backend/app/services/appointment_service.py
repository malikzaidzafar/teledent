"""
services/appointment_service.py — Booking, cancellation, completion.
"""
import uuid
from sqlalchemy.orm import Session
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.dentist import Dentist
from app.core.exceptions import NotFoundException, ConflictException, ForbiddenException
from app.core.pagination import paginate


def _resolve_patient(db: Session, user_id: str) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise NotFoundException("Patient profile for user", user_id)
    return patient


def _check_slot_available(db: Session, dentist_id: str, scheduled_at, duration_min: int):
    """Check for overlapping appointments."""
    pass  # TODO: implement overlap check


def create_appointment(db: Session, user_id: str, data: dict) -> Appointment:
    patient = _resolve_patient(db, user_id)
    _check_slot_available(db, data["dentist_id"], data["scheduled_at"], data.get("duration_min", 30))

    appt = Appointment(
        id=uuid.uuid4(),
        patient_id=patient.id,
        dentist_id=data["dentist_id"],
        scan_id=data.get("scan_id"),
        scheduled_at=data["scheduled_at"],
        duration_min=data.get("duration_min", 30),
        type=data.get("type", "video_consultation").lower().replace(" ", "_"),
        status=AppointmentStatus.pending,
        join_url=f"https://video.teledent.ai/session/{uuid.uuid4()}",
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
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
    appt.status = AppointmentStatus.cancelled
    db.commit()


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
    return appt


def complete_appointment(db: Session, appt_id: str, dentist_id: str):
    appt = db.query(Appointment).filter(Appointment.id == appt_id).first()
    if not appt:
        raise NotFoundException("Appointment", appt_id)
    appt.status = AppointmentStatus.completed
    db.commit()
