from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.patient import Patient, PatientImage, ImageAnalysis, PatientReport
from app.schemas.patients import (
    ImagesListResponse, LoginRequest, PatientCreate, PatientResponse, 
    Token, UploadImageWithAnalysisResponse
)
from app.utils.utils import create_access_token, verify_password, verify_token
import os
import shutil
import uuid
from datetime import datetime
from app.services.vision_service import DentalVisionService
from app.services.explanation_service import ExplanationService
from app.services.pdf_service import PDFReportService


explanation_service = ExplanationService()
vision_service = DentalVisionService()
pdf_service = PDFReportService()

router = APIRouter(prefix="/patients", tags=["Patients"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/patients/login/form", auto_error=False, scheme_name="PatientOAuth2")


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


@router.post("/upload-image", response_model=UploadImageWithAnalysisResponse)
def upload_image(
    file: UploadFile = File(...),
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG images allowed")
    
    # Generate UUIDs
    image_uuid = str(uuid.uuid4())
    analysis_uuid = str(uuid.uuid4())
    report_uuid = str(uuid.uuid4())
    
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{image_uuid}{file_extension}"
    
    # Create patient directory
    patient_dir = f"uploads/patient_{current_patient.id}"
    os.makedirs(patient_dir, exist_ok=True)
    
    # Save image
    file_path = f"{patient_dir}/{unique_filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Read image for analysis
    with open(file_path, "rb") as f:
        image_bytes = f.read()
    
    # Run AI analysis
    try:
        result = vision_service.analyze(image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    top = result["top_prediction"]
    
    # Helper function for confidence level
    def get_confidence_level(conf):
        return "High" if conf > 0.8 else "Medium" if conf > 0.5 else "Low"
    
    # Prepare all findings
    all_findings = []
    for condition, prob in result["all_probabilities"].items():
        all_findings.append({
            "condition": condition,
            "confidence": prob,
            "confidence_percentage": round(prob * 100, 2),
            "level": get_confidence_level(prob)
        })
    
    # Sort by confidence
    all_findings.sort(key=lambda x: x["confidence"], reverse=True)
    
    # Generate explanation
    explanation = explanation_service.generate_explanation(
        prediction=top["class"],
        confidence=top["confidence"],
        all_probabilities=result["all_probabilities"]
    )
    
    # Create image record in database
    db_image = PatientImage(
        uuid=image_uuid,
        patient_id=current_patient.id,
        filename=unique_filename,
        original_name=file.filename,
        file_path=file_path,
        file_size=file.size,
        mime_type=file.content_type
    )
    db.add(db_image)
    db.flush()  # Get the ID without committing
    
    # Create analysis record in database
    db_analysis = ImageAnalysis(
        uuid=analysis_uuid,
        image_id=db_image.id,
        prediction=top["class"],
        confidence=top["confidence"],
        all_probabilities=result["all_probabilities"],
        processing_time_ms=result["processing_time_ms"],
        explanation=explanation
    )
    db.add(db_analysis)
    db.flush()
    
    # Generate PDF report
    pdf_filename = f"reports/report_{analysis_uuid}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    os.makedirs("reports", exist_ok=True)
    
    # Prepare data for PDF
    pdf_data = {
        "primary_finding": {
            "condition": top["class"],
            "confidence_percentage": round(top["confidence"] * 100, 1),
            "level": get_confidence_level(top["confidence"])
        },
        "all_findings": all_findings,
        "explanation": explanation
    }
    
    # Generate PDF
    pdf_path = pdf_service.generate_report(
        patient_name=current_patient.username,
        analysis_data=pdf_data,
        filename=pdf_filename
    )
    
    # Create report record in database
    db_report = PatientReport(
        uuid=report_uuid,
        patient_id=current_patient.id,
        analysis_id=db_analysis.id,
        pdf_path=pdf_path,
        prediction=top["class"],
        confidence=top["confidence"],
        risk_level=get_confidence_level(top["confidence"]),
        recommendations=explanation.get("recommendations", []),
        explanation=explanation
    )
    db.add(db_report)
    
    # Commit all changes
    db.commit()
    
    # Return response with PDF URL
    return {
        "success": True,
        "message": "Image uploaded and analyzed successfully",
        "data": {
            "image": {
                "id": image_uuid,
                "filename": file.filename,
                "uploaded_at": db_image.uploaded_at.isoformat(),
                "size": file.size
            },
            "analysis": {
                "id": analysis_uuid,
                "primary_finding": {
                    "condition": top["class"],
                    "confidence": top["confidence"],
                    "confidence_percentage": round(top["confidence"] * 100, 2),
                    "level": get_confidence_level(top["confidence"])
                },
                "all_findings": all_findings,
                "explanation": explanation,
                "analysis_time_ms": result["processing_time_ms"],
                "pdf_url": f"/patients/download-report/{analysis_uuid}"
            }
        }
    }


@router.get("/get-all-images")
def get_my_images(
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    images = db.query(PatientImage).filter(
        PatientImage.patient_id == current_patient.id
    ).order_by(PatientImage.uploaded_at.desc()).all()
    
    result = []
    for img in images:
        result.append({
            "id": img.uuid,
            "original_name": img.original_name,
            "uploaded_at": img.uploaded_at.isoformat(),
            "size": img.file_size,
            "url": f"/patients/images/{img.uuid}"
        })
    
    return {"images": result}


@router.get("/images/{image_uuid}")
def get_image_by_id(
    image_uuid: str,
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    image = db.query(PatientImage).filter(
        PatientImage.uuid == image_uuid,
        PatientImage.patient_id == current_patient.id
    ).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    if not os.path.exists(image.file_path):
        raise HTTPException(status_code=404, detail="Image file not found")
    
    return FileResponse(
        path=image.file_path,
        media_type=image.mime_type,
        filename=image.original_name
    )


@router.get("/download-report/{analysis_uuid}")
def download_report(
    analysis_uuid: str,
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    # Find analysis by UUID
    analysis = db.query(ImageAnalysis).filter(
        ImageAnalysis.uuid == analysis_uuid
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Find report linked to this analysis
    report = db.query(PatientReport).filter(
        PatientReport.analysis_id == analysis.id,
        PatientReport.patient_id == current_patient.id
    ).first()
    
    if not report or not os.path.exists(report.pdf_path):
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=report.pdf_path,
        media_type='application/pdf',
        filename=f"teledent_report_{analysis_uuid}.pdf"
    )


@router.get("/analysis/{analysis_uuid}")
def get_analysis_details(
    analysis_uuid: str,
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    analysis = db.query(ImageAnalysis).filter(
        ImageAnalysis.uuid == analysis_uuid
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Verify image belongs to patient
    image = db.query(PatientImage).filter(
        PatientImage.id == analysis.image_id,
        PatientImage.patient_id == current_patient.id
    ).first()
    
    if not image:
        raise HTTPException(status_code=403, detail="Not authorized to view this analysis")
    
    return {
        "analysis_id": analysis.uuid,
        "prediction": analysis.prediction,
        "confidence": analysis.confidence,
        "all_probabilities": analysis.all_probabilities,
        "analyzed_at": analysis.analyzed_at.isoformat(),
        "explanation": analysis.explanation
    }


@router.get("/debug-all-data")
def debug_all_data(
    current_patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db)
):
    # Get all images for this patient
    images = db.query(PatientImage).filter(
        PatientImage.patient_id == current_patient.id
    ).all()
    
    result = {
        "patient_id": current_patient.id,
        "patient_username": current_patient.username,
        "images_count": len(images),
        "images": []
    }
    
    for img in images:
        # Get analysis for this image
        analysis = db.query(ImageAnalysis).filter(
            ImageAnalysis.image_id == img.id
        ).first()
        
        img_data = {
            "image_uuid": img.uuid,
            "filename": img.filename,
            "uploaded_at": str(img.uploaded_at),
            "analysis": None
        }
        
        if analysis:
            # Get report for this analysis
            report = db.query(PatientReport).filter(
                PatientReport.analysis_id == analysis.id
            ).first()
            
            img_data["analysis"] = {
                "analysis_uuid": analysis.uuid,
                "prediction": analysis.prediction,
                "report_exists": report is not None,
                "report_uuid": report.uuid if report else None,
                "pdf_path": report.pdf_path if report else None
            }
        
        result["images"].append(img_data)
    
    return result