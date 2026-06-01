"""
routers/patients.py — Patient resource endpoints.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import patient_service

router = APIRouter(prefix="/patients", tags=["Patients"])


class UpdatePatientIn(BaseModel):
    phone: Optional[str] = None
    address: Optional[str] = None
    # TODO: add fields as model is finalized


@router.get("", dependencies=[Depends(require_role("admin"))])
def list_patients(
    page: int = Query(1, ge=1), limit: int = Query(20, le=100),
    status: Optional[str] = None, search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return patient_service.list_patients(db, page, limit, status, search)


@router.get("/{patient_id}")
def get_patient(patient_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return patient_service.get_patient(db, patient_id, current_user)


@router.patch("/{patient_id}")
def update_patient(patient_id: str, body: UpdatePatientIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return patient_service.update_patient(db, patient_id, body.model_dump(exclude_none=True), current_user)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
def delete_patient(patient_id: str, db: Session = Depends(get_db)):
    patient_service.delete_patient(db, patient_id)


@router.get("/{patient_id}/scans")
def get_scans(patient_id: str, page: int = Query(1), limit: int = Query(20),
              current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return patient_service.get_patient_scans(db, patient_id, current_user, page, limit)


@router.get("/{patient_id}/appointments")
def get_appointments(patient_id: str, page: int = Query(1), limit: int = Query(20),
                     current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return patient_service.get_patient_appointments(db, patient_id, current_user, page, limit)


@router.get("/{patient_id}/reports")
def get_reports(patient_id: str, page: int = Query(1), limit: int = Query(20),
                current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return patient_service.get_patient_reports(db, patient_id, current_user, page, limit)
