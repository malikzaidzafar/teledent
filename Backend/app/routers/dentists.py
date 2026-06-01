"""
routers/dentists.py — Dentist listing and profile endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
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
