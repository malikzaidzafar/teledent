from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.patient import Patient
from app.routers.auth import get_current_patient
from app.schemas.patients import PatientCreate, PatientResponse

router = APIRouter(prefix="/patients", tags=["patients"])

@router.post("/register", response_model=PatientResponse)
def register_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    db_patient = db.query(Patient).filter(
        (Patient.email == patient.email) | (Patient.username == patient.username)
    ).first()

    if db_patient:
        raise HTTPException(status_code=400, detail="Patient already exists")

    new_patient = Patient(email=patient.email, username=patient.username)
    new_patient.set_password(patient.password)

    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    return new_patient

@router.get("/get_all_patients", response_model=List[PatientResponse])
def read_patients(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_patient: Patient = Depends(get_current_patient)
):
    patients = db.query(Patient).offset(skip).limit(limit).all()
    return patients

@router.delete("/deletepatient/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_patient: Patient = Depends(get_current_patient)
):
    if current_patient.id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own account"
        )

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )

    db.delete(patient)
    db.commit()
    return None