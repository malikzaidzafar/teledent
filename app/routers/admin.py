from fastapi import APIRouter, Depends, HTTPException , status 
from sqlalchemy.orm import Session
from typing import List
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.models.patient import Patient
from app.models.admin import Admin
from app.database import get_db
from app.schemas.admin import AdminLogin
from app.utils.utils import create_access_token, verify_password , verify_token
from app.schemas.patients import PatientResponse

router = APIRouter(prefix="/admin" , tags=["Admin"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/admin/login/form", scheme_name="AdminOAuth2")

def get_current_admin(
    token: str = Depends(oauth2_scheme),  
    db: Session = Depends(get_db)
):
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )
    
    username = payload.get("sub")
    admin = db.query(Admin).filter(Admin.username == username).first()
    
    if not admin:
        raise HTTPException(
            status_code=401,
            detail="Admin not found"
        )
    
    return admin

@router.post("/login")
def login_admin(login_data : AdminLogin , db : Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == login_data.username).one_or_none()
    if not admin:
        raise HTTPException(
            status_code=401,
            detail="incorrect username or passowrd"
        )
    if not verify_password(login_data.password, admin.password):
        raise HTTPException(
            status_code=401,
            detail= "incorrect username or password"
        )
    access_token = create_access_token(
    data={"sub": admin.username}
    )

    return {
        "access_token" : access_token,
        "token_type": "bearer"
    }

@router.post("/login/form")
def login_admin_form(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == form_data.username).one_or_none()
    if not admin:
        raise HTTPException(status_code=401, detail="incorrect username or password")
    if not verify_password(form_data.password, admin.password):
        raise HTTPException(status_code=401, detail="incorrect username or password")
    access_token = create_access_token(data={"sub": admin.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/get_all_patients", response_model=List[PatientResponse])
def read_patients(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    patients = db.query(Patient).offset(skip).limit(limit).all()
    return patients

@router.delete("/deletepatient/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )

    db.delete(patient)
    db.commit()
    return None


@router.get("/patients/{patient_id}/images")
def get_patient_images(
    patient_id: int,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin)
):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    images = []
    for img in patient.image_history or []:
        images.append({
            "id": img["id"],
            "original_name": img["original_name"],
            "uploaded_at": img["uploaded_at"],
            "url": f"/patients/images/{img['id']}"  
        })
    
    return {"patient_id": patient_id, "images": images}


