"""
routers/reports.py — Diagnosis report endpoints.
"""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["Reports"])


class CreateReportIn(BaseModel):
    scan_id: str
    patient_id: str
    dentist_notes: Optional[str] = None
    final_diagnosis: str
    recommended_actions: Optional[List[str]] = []
    follow_up_date: Optional[date] = None


class UpdateReportIn(BaseModel):
    dentist_notes: Optional[str] = None
    final_diagnosis: Optional[str] = None
    recommended_actions: Optional[List[str]] = None
    follow_up_date: Optional[date] = None


@router.get("")
def list_reports(page: int = Query(1), limit: int = Query(20), scan_id: Optional[str] = Query(None), current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.list_reports(db, str(current_user.id), current_user.role, page, limit, scan_id=scan_id)


@router.get("/{report_id}")
def get_report(report_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.get_report(db, report_id, current_user)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("dentist"))])
def create_report(body: CreateReportIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.create_report(db, current_user.id, body.model_dump())


@router.patch("/{report_id}", dependencies=[Depends(require_role("dentist"))])
def update_report(report_id: str, body: UpdateReportIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return report_service.update_report(db, report_id, str(current_user.id), body.model_dump(exclude_none=True))


@router.get("/{report_id}/pdf")
def get_pdf(report_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate the PDF on-demand and stream it directly — no Cloudinary redirect."""
    from fastapi.responses import Response
    from app.services.pdf_service import generate_report_pdf
    from app.models.scan import Scan
    from app.models.analysis import Analysis
    from app.models.patient import Patient
    from app.models.user import User

    report = report_service.get_report(db, report_id, current_user)  # auth + ownership check

    # Build report_data for the template
    findings, ai_explanation = [], {}
    original_image_url = annotated_image_url = None
    patient_name = "Patient"

    scan = db.query(Scan).filter(Scan.id == report.scan_id).first()
    if scan:
        original_image_url = scan.cloudinary_url
        analysis = db.query(Analysis).filter(Analysis.scan_id == scan.id).first()
        if analysis:
            findings = analysis.findings or []
            ai_explanation = analysis.ai_explanation or {}
            annotated_image_url = ai_explanation.get("annotated_image_url")
        patient = db.query(Patient).filter(Patient.id == scan.patient_id).first()
        if patient:
            user = db.query(User).filter(User.id == patient.user_id).first()
            if user:
                patient_name = f"{user.first_name} {user.last_name}"

    report_data = {
        "report_id": str(report.id),
        "patient_id": str(report.patient_id),
        "patient_name": patient_name,
        "is_auto_generated": report.is_auto_generated,
        "dentist_notes": report.dentist_notes,
        "final_diagnosis": report.final_diagnosis,
        "recommended_actions": report.recommended_actions or [],
        "follow_up_date": str(report.follow_up_date) if report.follow_up_date else None,
        "created_at": str(report.created_at),
        "findings": findings,
        "ai_explanation": ai_explanation,
        "original_image_url": original_image_url,
        "annotated_image_url": annotated_image_url,
    }

    pdf_bytes = generate_report_pdf(report_data)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="report-{str(report.id)[:8]}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
