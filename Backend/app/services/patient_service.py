"""
services/patient_service.py — Patient CRUD + sub-resources.
"""
from sqlalchemy.orm import Session
from app.models.patient import Patient
from app.models.scan import Scan
from app.models.appointment import Appointment
from app.models.report import Report
from app.models.user import User
from app.core.exceptions import NotFoundException, ForbiddenException
from app.core.pagination import paginate


def list_patients(db: Session, page: int, limit: int, status: str = None, search: str = None):
    q = db.query(Patient).join(User, Patient.user_id == User.id)
    if search:
        q = q.filter(
            (User.first_name + " " + User.last_name).ilike(f"%{search}%") |
            User.email.ilike(f"%{search}%")
        )
    total = q.count()
    patients = q.offset((page - 1) * limit).limit(limit).all()
    data = []
    for p in patients:
        scan_count = db.query(Scan).filter(Scan.patient_id == p.id).count()
        data.append({
            "id": str(p.id),
            "user_id": str(p.user_id),
            "full_name": f"{p.user.first_name} {p.user.last_name}",
            "email": p.user.email,
            "status": "active" if p.user.is_active else "inactive",
            "scan_count": scan_count,
        })
    import math
    return {
        "data": data,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit) if total else 0,
    }


def _dentist_has_appointment(db: Session, dentist_user_id: str, patient_id) -> bool:
    """Return True if the dentist (identified by their user_id) has any appointment with this patient."""
    from app.models.dentist import Dentist
    from app.models.appointment import Appointment
    dentist = db.query(Dentist).filter(Dentist.user_id == dentist_user_id).first()
    if not dentist:
        return False
    return db.query(Appointment).filter(
        Appointment.dentist_id == dentist.id,
        Appointment.patient_id == patient_id,
    ).first() is not None


def get_patient(db: Session, patient_id: str, current_user) -> Patient:
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise NotFoundException("Patient", patient_id)
    if current_user.role == "patient" and str(patient.user_id) != str(current_user.id):
        raise ForbiddenException()
    if current_user.role == "dentist" and not _dentist_has_appointment(db, current_user.id, patient.id):
        raise ForbiddenException()
    return patient


def update_patient(db: Session, patient_id: str, data: dict, current_user) -> Patient:
    patient = get_patient(db, patient_id, current_user)
    for field, value in data.items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


def delete_patient(db: Session, patient_id: str):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise NotFoundException("Patient", patient_id)
    db.delete(patient)
    db.commit()


def get_patient_scans(db: Session, patient_id: str, current_user, page: int, limit: int):
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or str(patient.user_id) != str(current_user.id):
            raise ForbiddenException()
    elif current_user.role == "dentist" and not _dentist_has_appointment(db, current_user.id, patient_id):
        raise ForbiddenException()
    q = db.query(Scan).filter(Scan.patient_id == patient_id).order_by(Scan.created_at.desc())
    return paginate(q, page, limit, schema=None)


def get_patient_appointments(db: Session, patient_id: str, current_user, page: int, limit: int):
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or str(patient.user_id) != str(current_user.id):
            raise ForbiddenException()
    elif current_user.role == "dentist" and not _dentist_has_appointment(db, current_user.id, patient_id):
        raise ForbiddenException()
    q = db.query(Appointment).filter(Appointment.patient_id == patient_id).order_by(Appointment.scheduled_at.asc())
    return paginate(q, page, limit, schema=None)


def get_patient_reports(db: Session, patient_id: str, current_user, page: int, limit: int):
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient or str(patient.user_id) != str(current_user.id):
            raise ForbiddenException()
    elif current_user.role == "dentist" and not _dentist_has_appointment(db, current_user.id, patient_id):
        raise ForbiddenException()
    q = db.query(Report).filter(Report.patient_id == patient_id).order_by(Report.created_at.desc())
    return paginate(q, page, limit, schema=None)
