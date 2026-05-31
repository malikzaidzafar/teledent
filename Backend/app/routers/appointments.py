"""
routers/appointments.py — Appointment booking and management.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import appointment_service

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


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("patient"))])
def create_appointment(body: CreateAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return appointment_service.create_appointment(db, str(current_user.id), body.model_dump())


@router.get("")
def list_appointments(page: int = Query(1), limit: int = Query(20), current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return appointment_service.list_appointments(db, str(current_user.id), current_user.role, page, limit)


@router.get("/{appt_id}")
def get_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return appointment_service.get_appointment(db, appt_id, current_user)


@router.patch("/{appt_id}")
def update_appointment(appt_id: str, body: UpdateAppointmentIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return appointment_service.update_appointment(db, appt_id, body.model_dump(exclude_none=True), current_user)


@router.delete("/{appt_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appointment_service.cancel_appointment(db, appt_id, current_user)


@router.post("/{appt_id}/complete", dependencies=[Depends(require_role("dentist"))])
def complete_appointment(appt_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    appointment_service.complete_appointment(db, appt_id, current_user.id)
    return {"message": "Appointment marked as completed."}
