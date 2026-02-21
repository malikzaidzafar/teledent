from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.patient import Patient
from app.utils.utils import verify_password, create_access_token, verify_token
from app.schemas.patients import Token, LoginRequest

router = APIRouter(prefix="/auth", tags=["authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login/form", auto_error=False)

@router.post("/login", response_model=Token)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.username == login_data.username).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    if not verify_password(login_data.password, patient.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    access_token = create_access_token(data={"sub": patient.username})

    return {"access_token": access_token, "token_type": "bearer"}


def get_current_patient(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

    username = payload.get("sub")
    patient = db.query(Patient).filter(Patient.username == username).first()

    if not patient:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Patient not found"
        )

    return patient

@router.get("/me")
def read_patients_me(current_patient: Patient = Depends(get_current_patient)):
    return {
        "id": current_patient.id,
        "username": current_patient.username,
        "email": current_patient.email
    }

@router.post("/login/form", response_model=Token)
def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.username == form_data.username).first()

    if not patient or not verify_password(form_data.password, patient.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    access_token = create_access_token(data={"sub": patient.username})
    return {"access_token": access_token, "token_type": "bearer"}