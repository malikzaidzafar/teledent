"""
services/report_service.py — Diagnosis report CRUD + PDF generation via Playwright.
"""
import uuid
from sqlalchemy.orm import Session
from app.models.report import Report
from app.models.patient import Patient
from app.core.exceptions import NotFoundException, ForbiddenException
from app.core.pagination import paginate


def create_report(db: Session, dentist_id: str, data: dict) -> Report:
    report = Report(
        id=uuid.uuid4(),
        scan_id=data["scan_id"],
        patient_id=data["patient_id"],
        dentist_id=dentist_id,
        is_auto_generated=False,
        dentist_notes=data.get("dentist_notes"),
        final_diagnosis=data["final_diagnosis"],
        recommended_actions=data.get("recommended_actions", []),
        follow_up_date=data.get("follow_up_date"),
    )
    db.add(report)
    from app.models.scan import Scan
    scan = db.query(Scan).filter(Scan.id == data["scan_id"]).first()
    if scan:
        scan.dentist_reviewed = True
    db.commit()
    db.refresh(report)
    _generate_and_store_pdf(db, report)
    return report


def create_auto_report(db: Session, scan, analysis) -> Report:
    """
    Create an AI-generated report immediately after analysis completes.
    dentist_id is None; dentists can later enrich it via update_report.
    """
    findings = analysis.findings or []
    expl = analysis.ai_explanation or {}

    top_condition = findings[0]["condition"] if findings else "No significant findings"
    recommended_actions = list({
        f.get("recommendation", "") for f in findings if f.get("recommendation")
    })

    report = Report(
        id=uuid.uuid4(),
        scan_id=scan.id,
        patient_id=scan.patient_id,
        dentist_id=None,
        is_auto_generated=True,
        final_diagnosis=top_condition,
        dentist_notes=None,
        recommended_actions=recommended_actions,
        follow_up_date=None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    _generate_and_store_pdf(db, report, scan=scan, analysis=analysis)
    return report


def _generate_and_store_pdf(db: Session, report: Report, scan=None, analysis=None):
    """
    Generate PDF and upload to Cloudinary.
    Uses a dedicated event loop in a worker thread so it is safe to call from
    both sync request handlers AND FastAPI BackgroundTasks (which run in the
    same thread-pool as the event loop — asyncio.run() would conflict there).
    """
    try:
        import concurrent.futures
        from app.services.pdf_service import generate_report_pdf, upload_pdf_to_cloudinary

        # Enrich report_data with scan + analysis for the template
        findings = []
        ai_explanation = {}
        original_image_url = None
        annotated_image_url = None
        patient_name = "Patient"

        if analysis:
            findings = analysis.findings or []
            ai_explanation = analysis.ai_explanation or {}
            annotated_image_url = ai_explanation.get("annotated_image_url")
        if scan:
            original_image_url = scan.cloudinary_url
            if not annotated_image_url and scan.ai_result:
                annotated_image_url = scan.ai_result.get("annotated_image_url")
            # Fetch patient name
            try:
                patient = db.query(Patient).filter(Patient.id == scan.patient_id).first()
                if patient and patient.user:
                    patient_name = f"{patient.user.first_name} {patient.user.last_name}"
            except Exception:
                pass
        elif not scan:
            # Fallback: load from DB
            try:
                from app.models.scan import Scan as ScanModel
                from app.models.analysis import Analysis as AnalysisModel
                s = db.query(ScanModel).filter(ScanModel.id == report.scan_id).first()
                if s:
                    original_image_url = s.cloudinary_url
                    a = db.query(AnalysisModel).filter(AnalysisModel.scan_id == s.id).first()
                    if a:
                        findings = a.findings or []
                        ai_explanation = a.ai_explanation or {}
                        annotated_image_url = ai_explanation.get("annotated_image_url")
                    try:
                        p = db.query(Patient).filter(Patient.id == s.patient_id).first()
                        if p and p.user:
                            patient_name = f"{p.user.first_name} {p.user.last_name}"
                    except Exception:
                        pass
            except Exception:
                pass

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

        # Run the synchronous WeasyPrint PDF generator in a dedicated thread
        # (WeasyPrint does file I/O internally so we keep it off the main thread)
        def _run_pdf():
            return generate_report_pdf(report_data)

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pdf_bytes = pool.submit(_run_pdf).result(timeout=60)

        pdf_url = upload_pdf_to_cloudinary(pdf_bytes, str(report.id))
        report.pdf_url = pdf_url
        db.commit()
    except Exception as e:
        import traceback
        print(f"[PDF] Generation failed for report {report.id}: {e}")
        print(traceback.format_exc())


def list_reports(db: Session, user_id: str, role: str, page: int, limit: int, scan_id: str = None):
    q = db.query(Report)
    if scan_id:
        q = q.filter(Report.scan_id == scan_id)
    if role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == user_id).first()
        if patient:
            q = q.filter(Report.patient_id == patient.id)
        else:
            return {"data": [], "total": 0, "page": page, "limit": limit, "pages": 0}
    elif role == "dentist":
        from app.models.dentist import Dentist
        from app.models.appointment import Appointment, AppointmentStatus
        from app.models.appointment_report import AppointmentReport
        dentist = db.query(Dentist).filter(Dentist.user_id == user_id).first()
        if dentist:
            # Dentist sees: (a) reports they authored, OR (b) reports explicitly shared via appointment_reports
            shared_report_ids = [
                str(ar.report_id) for ar in
                db.query(AppointmentReport)
                .join(Appointment, AppointmentReport.appointment_id == Appointment.id)
                .filter(
                    Appointment.dentist_id == dentist.id,
                    Appointment.status.in_([AppointmentStatus.pending, AppointmentStatus.confirmed, AppointmentStatus.completed]),
                )
                .all()
            ]
            q = q.filter(
                (Report.dentist_id == dentist.id) |
                (Report.id.in_(shared_report_ids))
            )
        else:
            return {"data": [], "total": 0, "page": page, "limit": limit, "pages": 0}
    q = q.order_by(Report.created_at.desc())
    return paginate(q, page, limit, schema=None)


def get_report(db: Session, report_id: str, current_user) -> Report:
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise NotFoundException("Report", report_id)
    if current_user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
        if not patient or str(report.patient_id) != str(patient.id):
            raise ForbiddenException()
    elif current_user.role == "dentist":
        from app.models.dentist import Dentist
        from app.models.appointment import Appointment, AppointmentStatus
        from app.models.appointment_report import AppointmentReport
        dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
        if dentist:
            is_author = report.dentist_id and str(report.dentist_id) == str(dentist.id)
            is_shared = db.query(AppointmentReport).join(
                Appointment, AppointmentReport.appointment_id == Appointment.id
            ).filter(
                AppointmentReport.report_id == report.id,
                Appointment.dentist_id == dentist.id,
                Appointment.status.in_([AppointmentStatus.pending, AppointmentStatus.confirmed, AppointmentStatus.completed]),
            ).first()
            if not is_author and not is_shared:
                raise ForbiddenException()
    return report


def update_report(db: Session, report_id: str, dentist_user_id: str, data: dict) -> Report:
    """Dentist enriches an existing report (auto-generated or their own)."""
    from app.models.dentist import Dentist
    from app.models.appointment import Appointment, AppointmentStatus

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise NotFoundException("Report", report_id)

    # Validate dentist has access
    dentist = db.query(Dentist).filter(Dentist.user_id == dentist_user_id).first()
    if not dentist:
        raise ForbiddenException()

    is_author = report.dentist_id and str(report.dentist_id) == str(dentist.id)
    active_statuses = [AppointmentStatus.pending, AppointmentStatus.confirmed, AppointmentStatus.completed]
    has_link = db.query(Appointment).filter(
        Appointment.dentist_id == dentist.id,
        Appointment.patient_id == report.patient_id,
        Appointment.status.in_(active_statuses),
    ).first()
    is_auto_claimable = report.is_auto_generated and report.dentist_id is None

    if not is_author and not has_link and not is_auto_claimable:
        raise ForbiddenException()

    # Assign dentist if this is an unclaimed auto-report
    if is_auto_claimable and report.dentist_id is None:
        report.dentist_id = dentist.id

    for field, value in data.items():
        setattr(report, field, value)

    # Mark scan as dentist-reviewed
    from app.models.scan import Scan
    scan = db.query(Scan).filter(Scan.id == report.scan_id).first()
    if scan:
        scan.dentist_reviewed = True

    db.commit()
    db.refresh(report)

    # Re-generate PDF with updated dentist notes
    _generate_and_store_pdf(db, report)

    # Refresh after PDF generation commits (prevents expired-attribute serialisation)
    try:
        db.refresh(report)
    except Exception:
        pass

    # Notify patient
    try:
        from app.models.notification import Notification
        import uuid as _uuid
        patient = db.query(Patient).filter(Patient.id == report.patient_id).first()
        if patient:
            dentist_name = (
                f"Dr. {dentist.user.first_name} {dentist.user.last_name}"
                if dentist.user else "Your dentist"
            )
            db.add(Notification(
                id=_uuid.uuid4(),
                user_id=patient.user_id,
                type="report.dentist_reviewed",
                title="Dentist reviewed your report",
                body=f"{dentist_name} has reviewed your scan and added professional notes.",
                data={"report_id": str(report.id), "scan_id": str(report.scan_id)},
            ))
            db.commit()
    except Exception as e:
        print(f"[Notification] Dentist-review notify failed: {e}")

    return report


def get_report_pdf_url(db: Session, report_id: str, current_user) -> str:
    report = get_report(db, report_id, current_user)
    if not report.pdf_url:
        raise NotFoundException("PDF for report", report_id)
    return report.pdf_url
