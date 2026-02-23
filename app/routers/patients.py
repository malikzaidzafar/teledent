from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.patient import Patient
from app.schemas.patients import ImagesListResponse, LoginRequest, PatientCreate, PatientResponse, Token, UploadImageResponse
from app.utils.utils import create_access_token, verify_password, verify_token
import os
import shutil
import uuid
from datetime import datetime

router = APIRouter(prefix="/patients", tags=["Patients"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/patients/login/form", auto_error=False)


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



@router.post("/upload-images", response_model=UploadImageResponse)
def upload_image(
    file: UploadFile = File(...),
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    allowed_types = ["image/jpeg", "image/png", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG images allowed")
    
    image_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{image_id}{file_extension}"
    
    patient_dir = f"uploads/patient_{current_patient.id}"
    os.makedirs(patient_dir, exist_ok=True)
    
    file_path = f"{patient_dir}/{unique_filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    image_record = {
        "id": image_id,
        "filename": unique_filename,
        "original_name": file.filename,
        "path": file_path,
        "uploaded_at": datetime.utcnow(),
        "size": file.size,
        "mime_type": file.content_type
    }
    
    if not current_patient.image_history:
        current_patient.image_history = []
    
    current_patient.image_history.append(image_record)
    db.commit()
    
    return {
        "message": "Image uploaded successfully",
        "image_id": image_id,
        "filename": file.filename,
        "uploaded_at": datetime.utcnow().isoformat()
    }


@router.get("/get-all-images", response_model=ImagesListResponse)
def get_my_images(
    current_patient: Patient = Depends(get_current_patient)
):
    images = []
    for img in current_patient.image_history or []:
        images.append({
            "id": img["id"],
            "original_name": img["original_name"],
            "uploaded_at": img["uploaded_at"],
            "size": img["size"],
            "url": f"/patients/images/{img['id']}"
        })
    
    return {"images": images}


@router.get("/images/{image_id}")
def get_image_by_id(
    image_id: str,
    current_patient: Patient = Depends(get_current_patient)
):
    image_record = None
    for img in current_patient.image_history or []:
        if img["id"] == image_id:
            image_record = img
            break
    
    if not image_record:
        raise HTTPException(status_code=404, detail="Image not found")
    
    if not os.path.exists(image_record["path"]):
        raise HTTPException(status_code=404, detail="Image file not found")
    
    return FileResponse(
        path=image_record["path"],
        media_type=image_record["mime_type"],
        filename=image_record["original_name"]
    )


@router.post("/analyze/{image_id}")
def analyze_image(
    image_id: str,
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    image_record = None
    for img in current_patient.image_history or []:
        if img["id"] == image_id:
            image_record = img
            break
    
    if not image_record:
        raise HTTPException(status_code=404, detail="Image not found")
    
    filename = image_record["filename"]
    
    filename_length = len(filename)
    
    if filename_length % 6 == 0:
        result = {
            "prediction": "Cavities",
            "confidence": 0.87,
            "description": "Tooth decay detected"
        }
    elif filename_length % 6 == 1:
        result = {
            "prediction": "Swollen or Bleeding Gums",
            "confidence": 0.79,
            "description": "Gum inflammation observed"
        }
    elif filename_length % 6 == 2:
        result = {
            "prediction": "Tooth Misalignment",
            "confidence": 0.92,
            "description": "Teeth not properly aligned"
        }
    elif filename_length % 6 == 3:
        result = {
            "prediction": "Missing or Broken Teeth",
            "confidence": 0.94,
            "description": "Fractured or missing tooth"
        }
    elif filename_length % 6 == 4:
        result = {
            "prediction": "Tooth Discoloration",
            "confidence": 0.81,
            "description": "Staining or yellowing detected"
        }
    else:
        result = {
            "prediction": "Plaque or Tartar Buildup",
            "confidence": 0.76,
            "description": "Mineralized plaque deposits"
        }
    
    analysis_id = str(uuid.uuid4())
    analysis_record = {
        "id": analysis_id,
        "image_id": image_id,
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "description": result["description"],
        "analyzed_at": datetime.utcnow().isoformat()
    }
    
    if "analyses" not in image_record:
        image_record["analyses"] = []
    
    image_record["analyses"].append(analysis_record)
    db.commit()
    
    return {
        "analysis_id": analysis_id,
        "image_id": image_id,
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "description": result["description"],
        "analyzed_at": datetime.utcnow()
    }

@router.post("/explain/{analysis_id}")
def explain_analysis(
    analysis_id: str,
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    # 1. Analysis dhundo (image_history ke andar analyses mein)
    analysis_record = None
    image_record_with_analysis = None
    
    for img in current_patient.image_history or []:
        if "analyses" in img:
            for analysis in img["analyses"]:
                if analysis["id"] == analysis_id:
                    analysis_record = analysis
                    image_record_with_analysis = img
                    break
        if analysis_record:
            break
    
    if not analysis_record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # 2. Analysis result
    prediction = analysis_record["prediction"]
    confidence = analysis_record["confidence"]
    
    # 3. Risk level decide karo (confidence ke basis pe)
    if confidence >= 0.9:
        risk_level = "high"
    elif confidence >= 0.7:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    # 4. LangChain explanation (abhi dummy)
    # Baad mein actual LangChain ayega
    
    explanations = {
        "Cavities": {
            "explanation": "Tooth decay (cavities) occurs when bacteria in your mouth produce acids that eat away at tooth enamel. The dark spots in your image indicate areas where decay has started.",
            "recommendations": [
                "Visit dentist for filling within 2 weeks",
                "Reduce sugary food and drinks",
                "Brush twice daily with fluoride toothpaste",
                "Floss daily to remove plaque between teeth"
            ]
        },
        "Swollen or Bleeding Gums": {
            "explanation": "Swollen or bleeding gums are signs of gingivitis or periodontitis - gum inflammation caused by plaque buildup. Your gums appear red and irritated in the image.",
            "recommendations": [
                "Schedule dental cleaning within 1 week",
                "Improve brushing technique along gumline",
                "Use antibacterial mouthwash",
                "Salt water rinses twice daily"
            ]
        },
        "Tooth Misalignment": {
            "explanation": "Tooth misalignment (malocclusion) means your teeth aren't properly positioned. This can lead to difficulty cleaning, uneven wear, and jaw problems.",
            "recommendations": [
                "Consult orthodontist for evaluation",
                "Consider braces or clear aligners",
                "Pay extra attention cleaning between crowded teeth",
                "Use interdental brushes for tight spaces"
            ]
        },
        "Missing or Broken Teeth": {
            "explanation": "Missing or broken teeth affect chewing ability and can cause remaining teeth to shift. The fracture line in your image needs immediate attention.",
            "recommendations": [
                "See dentist urgently (within days)",
                "Avoid chewing on affected side",
                "Consider crown, bridge, or implant options",
                "Rinse with warm salt water to prevent infection"
            ]
        },
        "Tooth Discoloration": {
            "explanation": "Tooth discoloration can be caused by staining from food/drinks, smoking, or certain medications. Your teeth show surface stains affecting appearance.",
            "recommendations": [
                "Professional cleaning to remove surface stains",
                "Consider whitening treatments",
                "Reduce coffee, tea, and red wine",
                "Use whitening toothpaste"
            ]
        },
        "Plaque or Tartar Buildup": {
            "explanation": "Plaque is sticky bacteria film that hardens into tartar if not removed. The yellow/white deposits in your image require professional removal.",
            "recommendations": [
                "Schedule dental cleaning soon",
                "Improve brushing technique",
                "Use electric toothbrush for better plaque removal",
                "Add water flosser to daily routine"
            ]
        }
    }
    
    # 5. Prediction ke according explanation do
    result = explanations.get(prediction, explanations["Cavities"])
    
    # 6. Report record banao
    report_id = str(uuid.uuid4())
    report_record = {
        "id": report_id,
        "analysis_id": analysis_id,
        "prediction": prediction,
        "confidence": confidence,
        "explanation": result["explanation"],
        "risk_level": risk_level,
        "recommendations": result["recommendations"],
        "generated_at": datetime.utcnow().isoformat()
    }
    
    # 7. Report save karo
    if not current_patient.report_history:
        current_patient.report_history = []
    
    current_patient.report_history.append(report_record)
    db.commit()
    
    # 8. Return response
    return {
        "report_id": report_id,
        "analysis_id": analysis_id,
        "prediction": prediction,
        "confidence": confidence,
        "explanation": result["explanation"],
        "risk_level": risk_level,
        "recommendations": result["recommendations"],
        "generated_at": datetime.utcnow()
    }


@router.get("/reports/{report_id}")
def get_report(
    report_id: str,
    current_patient: Patient = Depends(get_current_patient)
):
    """
    Returns a specific report by ID
    """
    for report in current_patient.report_history or []:
        if report["id"] == report_id:
            return report
    
    raise HTTPException(status_code=404, detail="Report not found")