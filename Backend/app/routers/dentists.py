"""
routers/dentists.py — Dentist listing and profile endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.dentist import Dentist
from app.models.user import User

router = APIRouter(prefix="/dentists", tags=["Dentists"])


class AvailabilityUpdate:
    def __init__(self, available_from: str = None, available_until: str = None, working_days: list = None):
        self.available_from = available_from
        self.available_until = available_until
        self.working_days = working_days


@router.get("/me")
def get_my_profile(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    from app.core.exceptions import NotFoundException, ForbiddenException
    if current_user.role != "dentist":
        raise ForbiddenException()
    dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
    if not dentist:
        raise NotFoundException("Dentist profile")
    schedule = dentist.schedule or {}
    return {
        "available_from": schedule.get("available_from", "09:00"),
        "available_until": schedule.get("available_until", "17:00"),
        "working_days": schedule.get("working_days", ["Mon", "Tue", "Wed", "Thu", "Fri"]),
    }


@router.patch("/me/availability")
def update_my_availability(payload: dict, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    from app.core.exceptions import NotFoundException, ForbiddenException
    if current_user.role != "dentist":
        raise ForbiddenException()
    dentist = db.query(Dentist).filter(Dentist.user_id == current_user.id).first()
    if not dentist:
        raise NotFoundException("Dentist profile")
    schedule = dict(dentist.schedule or {})
    if "available_from" in payload:
        schedule["available_from"] = payload["available_from"]
    if "available_until" in payload:
        schedule["available_until"] = payload["available_until"]
    if "working_days" in payload:
        schedule["working_days"] = payload["working_days"]
    dentist.schedule = schedule
    db.commit()
    db.refresh(dentist)
    return {
        "message": "Availability updated.",
        "available_from": schedule.get("available_from"),
        "available_until": schedule.get("available_until"),
        "working_days": schedule.get("working_days"),
    }


def _dentist_to_dict(dentist: Dentist) -> dict:
    user: User = dentist.user
    return {
        "id": str(dentist.id),
        "user_id": str(dentist.user_id),
        "full_name": f"{user.first_name} {user.last_name}",
        "email": user.email,
        "rating": dentist.rating,
        "available_today": True,  # TODO: check schedule
        "bio": dentist.bio,
        "license_number": dentist.license_number,
        "years_experience": dentist.years_experience,
    }


@router.get("")
def list_dentists(
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    search: Optional[str] = None,
    _=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Dentist).join(User).filter(Dentist.is_approved == True, User.is_active == True)
    if search:
        query = query.filter(
            (User.first_name + " " + User.last_name).ilike(f"%{search}%")
        )

    total = query.count()
    dentists = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "data": [_dentist_to_dict(d) for d in dentists],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/{dentist_id}")
def get_dentist(dentist_id: str, _=Depends(get_current_user), db: Session = Depends(get_db)):
    from app.core.exceptions import NotFoundException
    dentist = db.query(Dentist).filter(Dentist.id == dentist_id).first()
    if not dentist:
        raise NotFoundException("Dentist")
    return _dentist_to_dict(dentist)


@router.get("/{dentist_id}/slots")
def get_available_slots(
    dentist_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    _=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return available 30-min time slots for a dentist on a given date,
    based on their saved schedule and existing non-cancelled bookings.
    """
    from app.core.exceptions import NotFoundException
    from app.models.appointment import Appointment, AppointmentStatus

    dentist = db.query(Dentist).filter(Dentist.id == dentist_id).first()
    if not dentist:
        raise NotFoundException("Dentist")

    schedule = dentist.schedule or {}
    available_from = schedule.get("available_from", "09:00")
    available_until = schedule.get("available_until", "17:00")
    working_days = schedule.get("working_days", ["Mon", "Tue", "Wed", "Thu", "Fri"])

    # Parse requested date
    try:
        req_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return {"slots": []}

    # Check working day
    day_abbr = req_date.strftime("%a")  # "Mon", "Tue", etc.
    if day_abbr not in working_days:
        return {"slots": []}

    # Build all 30-min slots between available_from and available_until
    try:
        from_h, from_m = map(int, available_from.split(":"))
        until_h, until_m = map(int, available_until.split(":"))
    except ValueError:
        return {"slots": []}

    start_dt = datetime(req_date.year, req_date.month, req_date.day, from_h, from_m)
    end_dt   = datetime(req_date.year, req_date.month, req_date.day, until_h, until_m)

    all_slots = []
    cur = start_dt
    while cur + timedelta(minutes=30) <= end_dt:
        all_slots.append(cur)
        cur += timedelta(minutes=30)

    # Fetch existing non-cancelled appointments for this dentist on this day
    booked = db.query(Appointment).filter(
        Appointment.dentist_id == dentist_id,
        Appointment.scheduled_at >= start_dt,
        Appointment.scheduled_at < end_dt + timedelta(minutes=30),
        Appointment.status.notin_([AppointmentStatus.cancelled]),
    ).all()

    booked_times = set()
    for a in booked:
        # Normalize to naive datetime for comparison
        sa = a.scheduled_at
        if hasattr(sa, "tzinfo") and sa.tzinfo is not None:
            sa = sa.replace(tzinfo=None)
        booked_times.add(sa)

    now = datetime.utcnow()

    available = [
        s.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        for s in all_slots
        if s not in booked_times and s > now
    ]

    return {"slots": available, "date": date, "dentist_id": dentist_id}
