"""
routers/admin_stats.py — Admin-only platform statistics and management endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import require_role
from app.models.user import User
from app.models.patient import Patient
from app.models.dentist import Dentist
from app.models.scan import Scan
from app.models.appointment import Appointment
from app.models.report import Report
from app.models.video_session import VideoSession

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats", dependencies=[Depends(require_role("admin"))])
def get_stats(db: Session = Depends(get_db)):
    total_patients = db.query(Patient).count()
    total_dentists = db.query(Dentist).filter(Dentist.is_approved == True).count()
    total_scans = db.query(Scan).count()
    total_reports = db.query(Report).count()
    total_video_sessions = db.query(VideoSession).count()
    total_appointments = db.query(Appointment).count()

    # New patients this week
    from datetime import datetime, timedelta, timezone
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    new_patients = db.query(Patient).join(User, Patient.user_id == User.id).filter(
        User.created_at >= week_ago
    ).count()

    return {
        "total_patients": total_patients,
        "total_dentists": total_dentists,
        "total_scans": total_scans,
        "total_reports": total_reports,
        "total_video_sessions": total_video_sessions,
        "total_appointments": total_appointments,
        "new_patients_this_week": new_patients,
        "scans_this_month": total_scans,  # simplified
    }


@router.get("/dentists", dependencies=[Depends(require_role("admin"))])
def list_all_dentists(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    from app.core.pagination import paginate
    q = db.query(Dentist).join(User, Dentist.user_id == User.id)
    total = q.count()
    dentists = q.offset((page - 1) * limit).limit(limit).all()
    import math
    data = []
    for d in dentists:
        data.append({
            "id": str(d.id),
            "user_id": str(d.user_id),
            "full_name": f"{d.user.first_name} {d.user.last_name}",
            "email": d.user.email,
            "specialty": d.specialization,
            "is_approved": d.is_approved,
            "rating": d.rating,
        })
    return {
        "data": data,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit) if total else 0,
    }


@router.post("/dentists/{dentist_id}/approve", dependencies=[Depends(require_role("admin"))])
def approve_dentist(dentist_id: str, db: Session = Depends(get_db)):
    from app.core.exceptions import NotFoundException
    dentist = db.query(Dentist).filter(Dentist.id == dentist_id).first()
    if not dentist:
        raise NotFoundException("Dentist", dentist_id)
    dentist.is_approved = True
    dentist.user.is_active = True
    db.commit()
    return {"message": "Dentist approved."}


@router.post("/dentists/{dentist_id}/suspend", dependencies=[Depends(require_role("admin"))])
def suspend_dentist(dentist_id: str, db: Session = Depends(get_db)):
    from app.core.exceptions import NotFoundException
    dentist = db.query(Dentist).filter(Dentist.id == dentist_id).first()
    if not dentist:
        raise NotFoundException("Dentist", dentist_id)
    dentist.is_approved = False
    dentist.user.is_active = False
    db.commit()
    return {"message": "Dentist suspended."}


@router.post("/dentists/{dentist_id}/reactivate", dependencies=[Depends(require_role("admin"))])
def reactivate_dentist(dentist_id: str, db: Session = Depends(get_db)):
    from app.core.exceptions import NotFoundException
    dentist = db.query(Dentist).filter(Dentist.id == dentist_id).first()
    if not dentist:
        raise NotFoundException("Dentist", dentist_id)
    dentist.is_approved = True
    dentist.user.is_active = True
    db.commit()
    return {"message": "Dentist reactivated."}


@router.post("/invite-dentist", dependencies=[Depends(require_role("admin"))])
def invite_dentist(payload: dict, db: Session = Depends(get_db)):
    """
    Invite a dentist by creating a user account with a temp password
    and marking their dentist profile as pending approval.
    """
    import secrets
    from app.models.user import User, UserRole
    from app.core.security import hash_password

    email = payload.get("email", "").strip().lower()
    first_name = payload.get("first_name", "").strip()
    last_name = payload.get("last_name", "").strip()
    specialty = payload.get("specialty", "").strip()

    if not email or not first_name or not last_name:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="email, first_name and last_name are required.")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    temp_password = secrets.token_urlsafe(12)
    user = User(
        email=email,
        hashed_password=hash_password(temp_password),
        first_name=first_name,
        last_name=last_name,
        role=UserRole.dentist,
        is_active=False,
    )
    db.add(user)
    db.flush()

    dentist = Dentist(user_id=user.id, specialization=specialty, is_approved=False)
    db.add(dentist)
    db.commit()
    db.refresh(dentist)

    # Send invitation email via Resend
    from app.services.email_service import send_dentist_invite_email
    send_dentist_invite_email(email, first_name, temp_password)
    return {
        "message": f"Dentist {email} invited successfully. An email has been sent with login credentials.",
        "dentist_id": str(dentist.id),
    }


# ---------------------------------------------------------------------------
# Platform Settings (stored as simple in-memory defaults; swap for DB table)
# ---------------------------------------------------------------------------
_PLATFORM_SETTINGS: dict = {
    "platform": {
        "platform_name": "TeleDent AI",
        "support_email": "support@teledent.ai",
        "timezone": "UTC",
        "default_language": "en",
        "maintenance_mode": False,
    },
    "notifications": {
        "email_on_new_patient": True,
        "email_on_dentist_request": True,
        "email_on_scan_complete": True,
        "sms_alerts": False,
    },
    "security": {
        "require_email_verification": True,
        "session_timeout_minutes": 60,
        "max_login_attempts": 5,
        "two_factor_required": False,
    },
    "ai": {
        "auto_analyze_scans": True,
        "confidence_threshold": 0.75,
        "model_version": "v2",
    },
}


@router.get("/settings", dependencies=[Depends(require_role("admin"))])
def get_settings():
    return _PLATFORM_SETTINGS


@router.patch("/settings", dependencies=[Depends(require_role("admin"))])
def update_settings(payload: dict):
    for section, values in payload.items():
        if section in _PLATFORM_SETTINGS and isinstance(values, dict):
            _PLATFORM_SETTINGS[section].update(values)
    return _PLATFORM_SETTINGS
