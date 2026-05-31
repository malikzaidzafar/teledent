"""
routers/scans.py — Scan upload, retrieval, AI analysis.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.database import get_db, SessionLocal
from app.core.dependencies import get_current_user, require_role
from app.services import scan_service

router = APIRouter(prefix="/scans", tags=["Scans"])


class CreateScanIn(BaseModel):
    cloudinary_public_id: str
    cloudinary_url: str
    scan_type: str
    scan_date: date
    notes: Optional[str] = None


def _pipeline_task(scan_id: str):
    """
    Background task: opens its own DB session so it outlives the request session.
    FastAPI closes the request-scoped `db` as soon as the response is sent,
    so we must not reuse it here.
    """
    db = SessionLocal()
    try:
        from app.models.scan import Scan
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan_service._run_ai_pipeline(db, scan)
    finally:
        db.close()


@router.post("", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(require_role("patient"))])
def create_scan(
    body: CreateScanIn,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = scan_service.create_scan_record(db, str(current_user.id), body.model_dump())
    background_tasks.add_task(_pipeline_task, str(scan.id))
    return {"scan_id": str(scan.id), "status": scan.status, "estimated_processing_sec": 20}


@router.get("")
def list_scans(page: int = Query(1), limit: int = Query(20), current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return scan_service.list_scans(db, str(current_user.id), current_user.role, page, limit)


@router.get("/{scan_id}")
def get_scan(scan_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return scan_service.get_scan(db, scan_id, current_user)


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scan(scan_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    scan_service.delete_scan(db, scan_id, current_user)


@router.post("/{scan_id}/reanalyze", dependencies=[Depends(require_role("admin"))])
def reanalyze(scan_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    from app.models.scan import Scan, ScanStatus
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        from app.core.exceptions import NotFoundException
        raise NotFoundException("Scan", scan_id)
    scan.status = ScanStatus.queued
    db.commit()
    background_tasks.add_task(_pipeline_task, str(scan_id))
    return {"scan_id": str(scan_id), "status": "queued", "estimated_processing_sec": 20}


@router.get("/{scan_id}/analysis")
def get_analysis(scan_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return scan_service.get_analysis(db, scan_id, current_user)


@router.get("/{scan_id}/analysis/status")
def get_analysis_status(scan_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return scan_service.get_analysis_status(db, scan_id, current_user)
