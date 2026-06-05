"""
routers/appointments.py — Appointment booking and management.
"""
import uuid as _uuid
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import appointment_service
from app.models.dentist import Dentist as DentistModel
from app.models.patient import Patient
from app.models.user import User

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
except ImportError:
    _limiter = None

router = APIRouter(prefix="/appointments", tags=["Appointments"])


class CreateAppointmentIn(BaseModel):
    dentist_id: str
    scheduled_at: datetime
    duration_min: int = 30
    type: str = "video_consultation"
    scan_id: Optional[str] = None
    report_ids: Optional[List[str]] = None  # Reports to share with dentist


class UpdateAppointmentIn(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None


class PatientUpdateAppointmentIn(BaseModel):
    """Patients may only reschedule — they cannot touch status."""
    scheduled_at: Optional[datetime] = None


def _enrich_appointment(appt, db: Session) -> dict:
    """Serialize an Appointment model (or enrich an already serialized dict) and add user_id + name fields."""
    d: dict = {}
    if isinstance(appt, dict):
        d = appt.copy()
        dentist_id = appt.get("dentist_id")
        patient_id = appt.get("patient_id")
    else:
        for col in appt.__table__.columns:
            val = getattr(appt, col.name)
            if isinstance(val, _uuid.UUID):
                val = str(val)
            elif hasattr(val, "isoformat"):
                val = val.isoformat()
            elif hasattr(val, "value"):          # Enum
                val = val.value
            d[col.name] = val
        dentist_id = getattr(appt, "dentist_id", None)
        patient_id = getattr(appt, "patient_id", None)

    # Dentist user_id + name
    dentist = db.query(DentistModel).filter(DentistModel.id == dentist_id).first()
    if dentist:
        d["dentist_user_id"] = str(dentist.user_id)
        du = db.query(User).filter(User.id == dentist.user_id).first()
        d["dentist_name"] = f"Dr. {du.first_name} {du.last_name}" if du else "Dentist"
    else:
        d["dentist_user_id"] = None
        d["dentist_name"] = "Dentist"

    # Patient user_id + name
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient:
        d["patient_user_id"] = str(patient.user_id)
        pu = db.query(User).filter(User.id == patient.user_id).first()
        d["patient_name"] = f"{pu.first_name} {pu.last_name}" if pu else "Patient"
    else:
        d["patient_user_id"] = None
        d["patient_name"] = "Patient"

    return d


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("patient"))])
def create_appointment(request: Request, body: CreateAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if _limiter:
        _limiter.limit("10/minute")(lambda request: None)(request)
    appt = appointment_service.create_appointment(db, str(current_user.id), body.model_dump())
    return _enrich_appointment(appt, db)


@router.get("")
def list_appointments(page: int = Query(1), limit: int = Query(20), current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    result = appointment_service.list_appointments(db, str(current_user.id), current_user.role, page, limit)
    result["data"] = [_enrich_appointment(a, db) for a in result.get("data", [])]
    return result


@router.get("/{appt_id}")
def get_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appt = appointment_service.get_appointment(db, appt_id, current_user)
    return _enrich_appointment(appt, db)


@router.patch("/{appt_id}")
def update_appointment(appt_id: str, body: UpdateAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    from app.core.exceptions import ForbiddenException
    data = body.model_dump(exclude_none=True)
    # Patients must not be able to mutate status directly
    if current_user.role == "patient" and "status" in data:
        raise ForbiddenException("Patients cannot change appointment status directly.")
    appt = appointment_service.update_appointment(db, appt_id, data, current_user)
    return _enrich_appointment(appt, db)


@router.delete("/{appt_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appointment_service.cancel_appointment(db, appt_id, current_user)


class RejectAppointmentIn(BaseModel):
    reason: str


class RescheduleAppointmentIn(BaseModel):
    scheduled_at: datetime
    duration_min: int = 30


@router.post("/{appt_id}/accept", dependencies=[Depends(require_role("dentist"))])
def accept_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appt = appointment_service.accept_appointment(db, appt_id, current_user.id)
    return _enrich_appointment(appt, db)


@router.post("/{appt_id}/reschedule", dependencies=[Depends(require_role("patient"))])
def reschedule_appointment(appt_id: str, body: RescheduleAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Patient requests a reschedule — validates new slot and notifies dentist."""
    from app.core.exceptions import BadRequestException, ConflictException
    from app.models.appointment import AppointmentStatus
    from datetime import timezone

    appt = appointment_service.get_appointment(db, appt_id, current_user)
    if appt.status not in (AppointmentStatus.pending, AppointmentStatus.confirmed):
        raise ConflictException(f"Cannot reschedule an appointment with status '{appt.status.value}'.")

    new_scheduled_at = body.scheduled_at
    if new_scheduled_at.tzinfo is None:
        new_scheduled_at = new_scheduled_at.replace(tzinfo=timezone.utc)
    from datetime import datetime
    if new_scheduled_at <= datetime.now(timezone.utc):
        raise BadRequestException("New appointment time must be in the future.")

    # Validate slot availability (excluding this appointment)
    from app.models.appointment import Appointment as ApptModel
    from datetime import timedelta
    end_at = new_scheduled_at + timedelta(minutes=body.duration_min)
    candidates = db.query(ApptModel).filter(
        ApptModel.dentist_id == appt.dentist_id,
        ApptModel.id != appt.id,
        ApptModel.status.in_([AppointmentStatus.pending, AppointmentStatus.confirmed]),
        ApptModel.scheduled_at < end_at,
    ).all()
    overlap = next(
        (a for a in candidates if (a.scheduled_at + timedelta(minutes=a.duration_min or 30)) > new_scheduled_at),
        None,
    )
    if overlap:
        raise ConflictException("The new time slot is not available.")

    old_scheduled = appt.scheduled_at
    appt.scheduled_at = new_scheduled_at
    appt.duration_min = body.duration_min
    appt.status = AppointmentStatus.pending  # Requires re-confirmation by dentist
    db.commit()
    db.refresh(appt)

    # Notify dentist
    try:
        from app.models.patient import Patient as PatientModel
        from app.models.dentist import Dentist as DentistModel
        from app.models.user import User as UserModel
        from app.services import notification_service, email_service
        patient = db.query(PatientModel).filter(PatientModel.id == appt.patient_id).first()
        dentist = db.query(DentistModel).filter(DentistModel.id == appt.dentist_id).first()
        patient_user = db.query(UserModel).filter(UserModel.id == patient.user_id).first() if patient else None
        dentist_user = db.query(UserModel).filter(UserModel.id == dentist.user_id).first() if dentist else None
        if dentist_user and patient_user:
            patient_name = f"{patient_user.first_name} {patient_user.last_name}"
            dentist_name = f"Dr. {dentist_user.first_name} {dentist_user.last_name}"
            new_str = new_scheduled_at.strftime("%A, %B %d at %I:%M %p UTC")
            notification_service._create(
                db, str(dentist.user_id),
                type_="appointment.rescheduled",
                title="Appointment Rescheduled",
                body=f"{patient_name} has rescheduled their appointment to {new_str}. Please confirm.",
                data={"appointment_id": str(appt.id)},
            )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Reschedule notification failed: %s", exc)

    return _enrich_appointment(appt, db)


@router.post("/{appt_id}/reject", dependencies=[Depends(require_role("dentist"))])
def reject_appointment(appt_id: str, body: RejectAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appt = appointment_service.reject_appointment(db, appt_id, str(current_user.id), body.reason)
    return _enrich_appointment(appt, db)


@router.post("/{appt_id}/complete", dependencies=[Depends(require_role("dentist"))])
def complete_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appointment_service.complete_appointment(db, appt_id, str(current_user.id))
    return {"message": "Appointment marked as completed."}


# ---------------------------------------------------------------------------
# Shared Reports endpoints
# ---------------------------------------------------------------------------

class ShareReportsIn(BaseModel):
    report_ids: list[str]


@router.get("/{appt_id}/reports", dependencies=[Depends(require_role("patient", "dentist", "admin"))])
def list_shared_reports(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """List reports explicitly shared for this appointment."""
    from app.models.appointment_report import AppointmentReport
    from app.models.report import Report as ReportModel
    appt = appointment_service.get_appointment(db, appt_id, current_user)
    rows = (
        db.query(AppointmentReport)
        .filter(AppointmentReport.appointment_id == appt.id)
        .all()
    )
    result = []
    for ar in rows:
        rpt = db.query(ReportModel).filter(ReportModel.id == ar.report_id).first()
        if rpt:
            result.append({
                "report_id": str(rpt.id),
                "final_diagnosis": rpt.final_diagnosis,
                "created_at": rpt.created_at.isoformat() if rpt.created_at else None,
                "pdf_url": rpt.pdf_url,
                "is_auto_generated": rpt.is_auto_generated,
                "shared_at": ar.shared_at.isoformat() if ar.shared_at else None,
            })
    return result


@router.post("/{appt_id}/reports", dependencies=[Depends(require_role("patient"))])
def share_reports(appt_id: str, body: ShareReportsIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Patient shares reports for an appointment."""
    from app.models.appointment_report import AppointmentReport
    from app.models.report import Report as ReportModel
    from app.models.patient import Patient as PatientModel
    patient = db.query(PatientModel).filter(PatientModel.user_id == current_user.id).first()
    if not patient:
        from app.core.exceptions import NotFoundException
        raise NotFoundException("Patient profile", str(current_user.id))
    appt = appointment_service.get_appointment(db, appt_id, current_user)
    added = []
    for rid in body.report_ids:
        rpt = db.query(ReportModel).filter(
            ReportModel.id == rid,
            ReportModel.patient_id == patient.id,
        ).first()
        if rpt:
            existing = db.query(AppointmentReport).filter(
                AppointmentReport.appointment_id == appt.id,
                AppointmentReport.report_id == rpt.id,
            ).first()
            if not existing:
                db.add(AppointmentReport(appointment_id=appt.id, report_id=rpt.id))
                added.append(rid)
    db.commit()
    return {"added": added}


@router.delete("/{appt_id}/reports/{report_id}", status_code=204, dependencies=[Depends(require_role("patient"))])
def unshare_report(appt_id: str, report_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Patient removes a shared report from an appointment."""
    from app.models.appointment_report import AppointmentReport
    appt = appointment_service.get_appointment(db, appt_id, current_user)
    db.query(AppointmentReport).filter(
        AppointmentReport.appointment_id == appt.id,
        AppointmentReport.report_id == report_id,
    ).delete()
    db.commit()



# ---------------------------------------------------------------------------
# Shared Reports (Phase 2)
# ---------------------------------------------------------------------------

class ShareReportsIn(BaseModel):
    report_ids: List[str]


@router.get("/{appt_id}/reports", dependencies=[Depends(get_current_user)])
def list_shared_reports(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """List reports shared for this appointment."""
    from app.models.appointment_report import AppointmentReport
    from app.models.report import Report
    from app.core.exceptions import ForbiddenException, NotFoundException

    appt = appointment_service.get_appointment(db, appt_id, current_user)
    shared = (
        db.query(AppointmentReport)
        .filter(AppointmentReport.appointment_id == appt.id)
        .all()
    )
    result = []
    for s in shared:
        r = db.query(Report).filter(Report.id == s.report_id).first()
        if r:
            result.append({
                "report_id": str(r.id),
                "final_diagnosis": r.final_diagnosis,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "pdf_url": r.pdf_url,
                "is_auto_generated": r.is_auto_generated,
                "shared_at": s.shared_at.isoformat() if s.shared_at else None,
            })
    return result


@router.post("/{appt_id}/reports", dependencies=[Depends(require_role("patient"))], status_code=status.HTTP_201_CREATED)
def share_reports(appt_id: str, body: ShareReportsIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Patient shares additional reports with the dentist for this appointment."""
    from app.models.appointment_report import AppointmentReport
    from app.models.report import Report
    from app.core.exceptions import ForbiddenException

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise ForbiddenException()
    appt = appointment_service.get_appointment(db, appt_id, current_user)
    if str(appt.patient_id) != str(patient.id):
        raise ForbiddenException()

    added = []
    for rid in body.report_ids:
        rpt = db.query(Report).filter(Report.id == rid, Report.patient_id == patient.id).first()
        if rpt:
            exists = db.query(AppointmentReport).filter(
                AppointmentReport.appointment_id == appt.id,
                AppointmentReport.report_id == rpt.id,
            ).first()
            if not exists:
                link = AppointmentReport(appointment_id=appt.id, report_id=rpt.id)
                db.add(link)
                added.append(str(rpt.id))
    db.commit()
    return {"added": added}


@router.delete("/{appt_id}/reports/{report_id}", dependencies=[Depends(require_role("patient"))], status_code=status.HTTP_204_NO_CONTENT)
def unshare_report(appt_id: str, report_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Patient removes a report from the shared list for this appointment."""
    from app.models.appointment_report import AppointmentReport
    from app.core.exceptions import ForbiddenException

    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise ForbiddenException()
    appt = appointment_service.get_appointment(db, appt_id, current_user)
    if str(appt.patient_id) != str(patient.id):
        raise ForbiddenException()

    db.query(AppointmentReport).filter(
        AppointmentReport.appointment_id == appt.id,
        AppointmentReport.report_id == report_id,
    ).delete()
    db.commit()
