"""
routers/appointments.py — Appointment booking and management.
"""
import uuid as _uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import appointment_service
from app.models.dentist import Dentist as DentistModel
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/appointments", tags=["Appointments"])


class CreateAppointmentIn(BaseModel):
    dentist_id: str
    scheduled_at: datetime
    duration_min: int = 30
    type: str = "video_consultation"
    scan_id: Optional[str] = None


class UpdateAppointmentIn(BaseModel):
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None


def _enrich_appointment(appt, db: Session) -> dict:
    """Serialize an Appointment model to a dict and add user_id + name fields."""
    d: dict = {}
    for col in appt.__table__.columns:
        val = getattr(appt, col.name)
        if isinstance(val, _uuid.UUID):
            val = str(val)
        elif hasattr(val, "isoformat"):
            val = val.isoformat()
        elif hasattr(val, "value"):          # Enum
            val = val.value
        d[col.name] = val

    # Dentist user_id + name
    dentist = db.query(DentistModel).filter(DentistModel.id == appt.dentist_id).first()
    if dentist:
        d["dentist_user_id"] = str(dentist.user_id)
        du = db.query(User).filter(User.id == dentist.user_id).first()
        d["dentist_name"] = f"Dr. {du.first_name} {du.last_name}" if du else "Dentist"
    else:
        d["dentist_user_id"] = None
        d["dentist_name"] = "Dentist"

    # Patient user_id + name
    patient = db.query(Patient).filter(Patient.id == appt.patient_id).first()
    if patient:
        d["patient_user_id"] = str(patient.user_id)
        pu = db.query(User).filter(User.id == patient.user_id).first()
        d["patient_name"] = f"{pu.first_name} {pu.last_name}" if pu else "Patient"
    else:
        d["patient_user_id"] = None
        d["patient_name"] = "Patient"

    return d


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("patient"))])
def create_appointment(body: CreateAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
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
    appt = appointment_service.update_appointment(db, appt_id, body.model_dump(exclude_none=True), current_user)
    return _enrich_appointment(appt, db)


@router.delete("/{appt_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appointment_service.cancel_appointment(db, appt_id, current_user)


@router.post("/{appt_id}/accept", dependencies=[Depends(require_role("dentist"))])
def accept_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appt = appointment_service.accept_appointment(db, appt_id, current_user.id)
    return _enrich_appointment(appt, db)


@router.post("/{appt_id}/complete", dependencies=[Depends(require_role("dentist"))])
def complete_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appointment_service.complete_appointment(db, appt_id, current_user.id)
    return {"message": "Appointment marked as completed."}
