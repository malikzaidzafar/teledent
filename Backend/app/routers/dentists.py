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


def _dentist_to_dict(dentist: Dentist) -> dict:
    user: User = dentist.user
    return {
        "id": str(dentist.id),
        "user_id": str(dentist.user_id),
        "full_name": f"{user.first_name} {user.last_name}",
        "email": user.email,
        "specialty": dentist.specialization,
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
    specialty: Optional[str] = None,
    _=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Dentist).join(User).filter(Dentist.is_approved == True, User.is_active == True)
    if search:
        query = query.filter(
            (User.first_name + " " + User.last_name).ilike(f"%{search}%")
        )
    if specialty:
        query = query.filter(Dentist.specialization.ilike(f"%{specialty}%"))

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
