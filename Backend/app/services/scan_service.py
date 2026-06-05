"""
services/scan_service.py — Scan CRUD + Cloudinary integration + AI trigger.
"""
import uuid
from sqlalchemy.orm import Session
from app.models.scan import Scan, ScanStatus, ScanType
from app.models.patient import Patient
from app.models.analysis import Analysis, AnalysisStatus
from app.core.exceptions import NotFoundException, ForbiddenException
from app.core.pagination import paginate


# Map frontend free-text scan types  DB enum values
_SCAN_TYPE_MAP = {
    "panoramic x-ray": ScanType.panoramic,
    "panoramic":       ScanType.panoramic,
    "periapical x-ray": ScanType.periapical,
    "periapical":       ScanType.periapical,
    "bitewing x-ray":  ScanType.bitewing,
    "bitewing":        ScanType.bitewing,
    "intraoral photo": ScanType.intraoral,
    "intraoral":       ScanType.intraoral,
}


def _resolve_patient(db: Session, user_id: str) -> Patient:
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise NotFoundException("Patient profile for user", user_id)
    return patient


def _normalize_scan_type(raw: str) -> ScanType:
    key = raw.lower().strip()
    if key in _SCAN_TYPE_MAP:
        return _SCAN_TYPE_MAP[key]
    # Try exact enum match
    try:
        return ScanType(key)
    except ValueError:
        return ScanType.panoramic  # safe default


def create_scan_record(db: Session, user_id: str, data: dict) -> Scan:
    """Save scan to DB and return immediately — pipeline runs in background."""
    patient = _resolve_patient(db, user_id)
    scan = Scan(
        id=uuid.uuid4(),
        patient_id=patient.id,
        cloudinary_public_id=data["cloudinary_public_id"],
        cloudinary_url=data["cloudinary_url"],
        scan_type=_normalize_scan_type(data["scan_type"]),
        scan_date=data["scan_date"],
        notes=data.get("notes"),
        status=ScanStatus.queued,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


# Keep old name as alias so existing callers don't break
def create_scan(db: Session, user_id: str, data: dict) -> Scan:
    scan = create_scan_record(db, user_id, data)
    _run_ai_pipeline(db, scan)
    return scan


# ── Singleton vision client (initialised once per process) ──────────────────
_vision_service = None

def _get_vision_service():
    global _vision_service
    if _vision_service is None:
        from app.services.vision_service import DentalVisionService
        _vision_service = DentalVisionService()
    return _vision_service
# ─────────────────────────────────────────────────────────────────────────────


def _run_ai_pipeline(db: Session, scan: Scan):
    """
    Full pipeline: AI detection → Gemini enrichment → Analysis save
                   → Auto-report → PDF → Notifications.

    Oral / intraoral photos  → VGG16 Keras classifier (4-class: cavity / gingivitis /
                                                       discoloration / ulcer)
    X-ray scans              → CNN Keras classifier   (3-class: caries /
                                                       impacted_tooth / periapical_lesion)
    """
    import httpx
    from datetime import datetime, timezone

    # ── 1. Mark as processing ─────────────────────────────────────────────
    scan.status = ScanStatus.processing
    db.commit()

    try:
        # ── 2. Download image ─────────────────────────────────────────────
        response = httpx.get(scan.cloudinary_url, timeout=30)
        response.raise_for_status()
        image_bytes = response.content

        # ── 2b. Denoise / degrain image before AI analysis ────────────────
        from app.services.image_preprocessing_service import preprocess_image
        image_bytes = preprocess_image(image_bytes)

        # ── 3. Route to the correct AI model ─────────────────────────────
        from app.services.keras_xray_service import XRAY_SCAN_TYPES
        scan_type_str = scan.scan_type.value if hasattr(scan.scan_type, "value") else str(scan.scan_type)
        is_xray = scan_type_str.lower() in XRAY_SCAN_TYPES
        vision = _get_vision_service()

        if is_xray:
            # ── 3a. X-ray: CNN Keras classification (3-class) ─────────────
            from app.services.keras_xray_service import run_keras_xray_classification
            keras_xray_result = run_keras_xray_classification(image_bytes)

            # ── 4a. Gemini enrichment (CNN X-ray context) ─────────────────
            gemini_result = vision.analyze_with_keras_xray_context(image_bytes, keras_xray_result)

            # ── 5a. Build findings from CNN detections ─────────────────────
            findings: list[dict] = []
            xray_findings = keras_xray_result.get("findings", [])
            enriched = gemini_result.get("findings_enriched", [])
            for i, finding in enumerate(xray_findings):
                gem = enriched[i] if i < len(enriched) else {}
                severity = gem.get("severity") or (
                    "high"     if finding["confidence"] > 0.7
                    else "moderate" if finding["confidence"] > 0.4
                    else "low"
                )
                findings.append({
                    "condition":         finding["display"],
                    "confidence":        finding["confidence"],
                    "severity":          severity,
                    "bounding_box":      None,  # CNN classifier — no bounding boxes
                    "gemini_explanation": gem.get("gemini_explanation", ""),
                    "recommendation":    gem.get("recommendation", f"Consult dentist about {finding['display']}."),
                })

            ai_explanation = {
                "patient_summary":     gemini_result.get("patient_summary", ""),
                "clinical_notes":      gemini_result.get("clinical_notes", ""),
                "overall_risk":        gemini_result.get("overall_risk", "none"),
                "urgency":             gemini_result.get("urgency", "monitor"),
                "image_quality":       gemini_result.get("image_quality", "unknown"),
                "annotated_image_url": None,  # no annotated image from CNN
                "all_probabilities":   keras_xray_result.get("all_probabilities", {}),
            }
            annotated_url = None
            model_version = "cnn-xray-3class-gemini-v1"

        else:
            # ── 3b. Oral photo: VGG16 Keras classification ────────────────
            from app.services.keras_oral_service import run_keras_classification
            keras_result = run_keras_classification(image_bytes)

            # ── 4b. Gemini enrichment (VGG16 context) ─────────────────────
            gemini_result = vision.analyze_with_keras_context(image_bytes, keras_result)

            # ── 5b. Build single finding from classification result ────────
            findings: list[dict] = []
            top_class = keras_result.get("top_display", "Cavity")
            top_conf  = keras_result.get("top_confidence", 0.0)
            if keras_result.get("success") and top_conf > 0.0:
                enriched_list = gemini_result.get("findings_enriched", [])
                gem = enriched_list[0] if enriched_list else {}
                severity = gem.get("severity") or (
                    "high" if top_conf > 0.7
                    else "moderate" if top_conf > 0.4
                    else "low"
                )
                findings = [{
                    "condition": top_class,
                    "confidence": top_conf,
                    "severity": severity,
                    "bounding_box": None,
                    "gemini_explanation": gem.get("gemini_explanation", ""),
                    "recommendation": gem.get("recommendation", f"Consult dentist about {top_class}."),
                }]

            ai_explanation = {
                "patient_summary": gemini_result.get("patient_summary", ""),
                "clinical_notes": gemini_result.get("clinical_notes", ""),
                "overall_risk": gemini_result.get("overall_risk", "none"),
                "urgency": gemini_result.get("urgency", "monitor"),
                "image_quality": gemini_result.get("image_quality", "unknown"),
                "annotated_image_url": None,
                "all_probabilities": keras_result.get("all_probabilities", {}),
            }
            annotated_url = None
            model_version = "vgg16-keras-gemini-v1"

        top_condition = findings[0]["condition"] if findings else "No findings"
        top_confidence = findings[0]["confidence"] if findings else 0.0

        # ── 7. Save Analysis ──────────────────────────────────────────────
        analysis = Analysis(
            id=uuid.uuid4(),
            scan_id=scan.id,
            status=AnalysisStatus.complete,
            confidence_score=top_confidence,
            findings=findings,
            ai_explanation=ai_explanation,
            model_version=model_version,
            processed_at=datetime.now(timezone.utc),
        )
        db.add(analysis)

        # ── 8. Persist analysis + ai_result cache.
        #       Keep scan.status as "processing" until the PDF is ready so the
        #       frontend doesn't navigate to the report page before pdf_url exists.
        scan.ai_result = {
            "confidence": top_confidence,
            "findings_count": len(findings),
            "top_condition": top_condition,
            "overall_risk": gemini_result.get("overall_risk", "none"),
            "annotated_image_url": annotated_url,
        }
        db.commit()
        db.refresh(analysis)

        # ── 9. Auto-generate report + PDF ────────────────────────────────
        from app.services import report_service
        report = report_service.create_auto_report(db, scan, analysis)

        # ── 10. Mark scan complete ONLY after pdf_url is committed ────────
        #        The frontend polls this status; by the time it sees "complete"
        #        the report already has pdf_url set in the DB.
        scan.status = ScanStatus.complete
        db.commit()

        # ── 11. Notifications ─────────────────────────────────────────────
        _send_analysis_notifications(db, scan, report)

    except Exception as e:
        print(f"[AI Pipeline] Failed for scan {scan.id}: {e}")
        scan.status = ScanStatus.failed
        db.commit()


def list_scans(db: Session, user_id: str, role: str, page: int, limit: int):
    q = db.query(Scan)
    if role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == user_id).first()
        if patient:
            q = q.filter(Scan.patient_id == patient.id)
        else:
            return {"data": [], "total": 0, "page": page, "limit": limit, "pages": 0}
    elif role == "dentist":
        from app.models.dentist import Dentist
        from app.models.appointment import Appointment
        dentist = db.query(Dentist).filter(Dentist.user_id == user_id).first()
        if dentist:
            linked_patient_ids = [
                a.patient_id for a in
                db.query(Appointment).filter(Appointment.dentist_id == dentist.id).all()
            ]
            q = q.filter(Scan.patient_id.in_(linked_patient_ids))
        else:
            return {"data": [], "total": 0, "page": page, "limit": limit, "pages": 0}
    # admin sees all scans
    q = q.order_by(Scan.created_at.desc())
    return paginate(q, page, limit, schema=None)


def get_scan(db: Session, scan_id: str, current_user) -> Scan:
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise NotFoundException("Scan", scan_id)
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or str(scan.patient_id) != str(patient.id):
            raise ForbiddenException()
    return scan


def delete_scan(db: Session, scan_id: str, current_user):
    scan = get_scan(db, scan_id, current_user)
    db.delete(scan)
    db.commit()


def reanalyze_scan(db: Session, scan_id: str) -> dict:
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise NotFoundException("Scan", scan_id)
    scan.status = ScanStatus.queued
    db.commit()
    _run_ai_pipeline(db, scan)
    return {"scan_id": str(scan_id), "status": scan.status, "estimated_processing_sec": 20}


def get_analysis(db: Session, scan_id: str, current_user):
    from app.models.report import Report
    scan = get_scan(db, scan_id, current_user)
    analysis = db.query(Analysis).filter(Analysis.scan_id == scan.id).first()
    if not analysis:
        return {
            "scan_id": str(scan_id), "status": "pending", "findings": [],
            "confidence_score": 0, "processed_at": None, "model_version": None,
            "ai_explanation": None, "report_id": None,
        }
    # Find the auto-generated (or dentist) report for this scan
    report = db.query(Report).filter(Report.scan_id == scan.id).first()
    return {
        "scan_id": str(scan_id),
        "status": analysis.status,
        "confidence_score": analysis.confidence_score,
        "findings": analysis.findings or [],
        "ai_explanation": analysis.ai_explanation or {},
        "processed_at": str(analysis.processed_at) if analysis.processed_at else None,
        "model_version": analysis.model_version,
        "report_id": str(report.id) if report else None,
    }


def _send_analysis_notifications(db: Session, scan: Scan, report):
    """Create in-app notifications for the patient and any linked dentists."""
    try:
        from app.models.notification import Notification
        from app.models.appointment import Appointment
        import uuid as _uuid

        report_id_str = str(report.id) if report else None

        # Notify patient
        patient_user_id = scan.patient.user_id
        db.add(Notification(
            id=_uuid.uuid4(),
            user_id=patient_user_id,
            type="scan.complete",
            title="Your scan analysis is ready",
            body="Your dental scan has been analysed by AI. Tap to view your results and report.",
            data={"scan_id": str(scan.id), "report_id": report_id_str},
        ))

        # Notify linked dentists (any appointment with this patient)
        linked = (
            db.query(Appointment)
            .filter(Appointment.patient_id == scan.patient_id)
            .all()
        )
        seen_dentists: set = set()
        for appt in linked:
            if appt.dentist_id in seen_dentists:
                continue
            seen_dentists.add(appt.dentist_id)
            dentist_user_id = appt.dentist.user_id if appt.dentist else None
            if dentist_user_id:
                db.add(Notification(
                    id=_uuid.uuid4(),
                    user_id=dentist_user_id,
                    type="scan.patient_complete",
                    title="Patient scan ready for review",
                    body=f"An AI analysis is ready for one of your patients. Please review and add your clinical notes.",
                    data={"scan_id": str(scan.id), "report_id": report_id_str},
                ))

        db.commit()
    except Exception as e:
        print(f"[Notification] Failed for scan {scan.id}: {e}")


def get_analysis_status(db: Session, scan_id: str, current_user):
    scan = get_scan(db, scan_id, current_user)
    return {"scan_id": str(scan_id), "status": scan.status}
