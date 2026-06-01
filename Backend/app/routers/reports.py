"""
routers/reports.py — Diagnosis report endpoints.
"""
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import RedirectResponse
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
    pdf_url = report_service.get_report_pdf_url(db, report_id, current_user)
    return RedirectResponse(url=pdf_url, status_code=302)
