"""
routers/auth.py — Auth endpoints. Thin HTTP layer only.
All logic is in services/auth_service.py.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from pydantic.functional_validators import AfterValidator
from typing import Annotated, Optional
from email_validator import validate_email, EmailNotValidError
from app.database import get_db


def _loose_email(v: str) -> str:
    try:
        info = validate_email(v, check_deliverability=False)
        return info.normalized
    except EmailNotValidError as e:
        raise ValueError(str(e))

LooseEmail = Annotated[str, AfterValidator(_loose_email)]
from app.core.dependencies import get_current_user
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Auth"])


# --- Schemas (inline for now; move to schemas/auth.py later) ---
class RegisterIn(BaseModel):
    email: LooseEmail
    password: str
    first_name: str
    last_name: str
    role: str = "patient"

class LoginIn(BaseModel):
    email: LooseEmail
    password: str

class RefreshIn(BaseModel):
    refresh_token: str

class ForgotPasswordIn(BaseModel):
    email: LooseEmail

class ResetPasswordIn(BaseModel):
    token: str
    new_password: str

class UpdateMeIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None


# --- Routes ---
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    return auth_service.register_user(db, **body.model_dump())


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    return auth_service.login_user(db, body.email, body.password)


@router.post("/logout")
def logout(body: RefreshIn, _=Depends(get_current_user)):
    auth_service.logout_user(body.refresh_token)
    return {"message": "Logged out."}


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    return auth_service.refresh_tokens(db, body.refresh_token)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordIn, db: Session = Depends(get_db)):
    auth_service.forgot_password(db, body.email)
    return {"message": "If this email exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    auth_service.reset_password(db, body.token, body.new_password)
    return {"message": "Password updated successfully."}


@router.get("/me")
def me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return auth_service.get_me(db, current_user.id)


@router.patch("/me")
def update_me(body: UpdateMeIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return auth_service.update_me(db, current_user.id, body.model_dump(exclude_none=True))
