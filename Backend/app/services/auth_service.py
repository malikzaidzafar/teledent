"""
services/auth_service.py — All auth business logic.
Routers call these functions; no SQLAlchemy queries in routers.
"""
import uuid
from sqlalchemy.orm import Session
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, create_reset_token, decode_token
from app.core.exceptions import UnauthorizedException, ConflictException, BadRequestException, NotFoundException
from app.models.user import User, UserRole
from app.models.patient import Patient
from app.models.dentist import Dentist
from app.config import settings


def register_user(db: Session, email: str, password: str, first_name: str, last_name: str, role: str) -> dict:
    if db.query(User).filter(User.email == email).first():
        raise ConflictException("An account with this email already exists.")

    user = User(
        email=email,
        hashed_password=hash_password(password),
        first_name=first_name,
        last_name=last_name,
        role=UserRole(role),
    )
    db.add(user)
    db.flush()  # get user.id without full commit

    # Create role-specific profile
    if role == "patient":
        db.add(Patient(id=uuid.uuid4(), user_id=user.id))
    elif role == "dentist":
        auto_approve = getattr(settings, "DEBUG", False)
        db.add(Dentist(id=uuid.uuid4(), user_id=user.id, is_approved=bool(auto_approve)))

    db.commit()
    db.refresh(user)

    access = create_access_token(str(user.id), user.role)
    refresh = create_refresh_token(str(user.id))
    return {"user": _serialize_user(user), "access_token": access, "refresh_token": refresh}


MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def login_user(db: Session, email: str, password: str) -> dict:
    from datetime import datetime, timezone, timedelta

    user = db.query(User).filter(User.email == email, User.is_active == True).first()

    # Unknown email — still return generic 401 (no info leakage)
    if not user:
        raise UnauthorizedException("Invalid email or password.")

    # Check lockout
    now = datetime.now(timezone.utc)
    locked_until = user.locked_until
    if locked_until is not None and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until and locked_until > now:
        remaining = int((locked_until - now).total_seconds() / 60) + 1
        raise UnauthorizedException(
            f"Account locked due to too many failed attempts. "
            f"Try again in {remaining} minute(s)."
        )

    # Verify password
    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            db.commit()
            raise UnauthorizedException(
                f"Account locked after {MAX_FAILED_ATTEMPTS} failed attempts. "
                f"Try again in {LOCKOUT_MINUTES} minutes."
            )
        db.commit()
        raise UnauthorizedException("Invalid email or password.")

    # Successful login — reset counter
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()

    access = create_access_token(str(user.id), user.role)
    refresh = create_refresh_token(str(user.id))
    return {"user": _serialize_user(user), "access_token": access, "refresh_token": refresh, "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60}


def refresh_tokens(db: Session, refresh_token: str) -> dict:
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise UnauthorizedException("Invalid or expired refresh token.")
    # TODO: check Redis blacklist for this refresh token
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise UnauthorizedException("User not found.")
    return {
        "access_token": create_access_token(str(user.id), user.role),
        "refresh_token": create_refresh_token(str(user.id)),
    }


def logout_user(refresh_token: str):
    # TODO: add refresh_token to Redis blacklist with TTL = remaining token lifetime
    pass


def forgot_password(db: Session, email: str):
    user = db.query(User).filter(User.email == email).first()
    if user:
        token = create_reset_token(str(user.id))
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        from app.services.email_service import send_reset_email
        send_reset_email(user.email, reset_url)
    # Always return success to prevent email enumeration


def _serialize_user(user: User) -> dict:
    from app.models.dentist import Dentist
    role = user.role.value if hasattr(user.role, 'value') else str(user.role)
    data = {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": role,
        "is_active": user.is_active,
        "is_approved": None,
    }
    if role == "dentist" and hasattr(user, "dentist_profile") and user.dentist_profile:
        data["is_approved"] = user.dentist_profile.is_approved
    return data


def reset_password(db: Session, token: str, new_password: str):
    payload = decode_token(token)
    if not payload or payload.get("type") != "reset":
        raise BadRequestException("Invalid or expired reset token.")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise NotFoundException("User")
    user.hashed_password = hash_password(new_password)
    db.commit()


def get_me(db: Session, user_id: str) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundException("User", user_id)
    return _serialize_user(user)


def update_me(db: Session, user_id: str, data: dict) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundException("User", user_id)
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


def google_auth(db: Session, id_token: str, role: str = "patient") -> dict:
    """Verify a Google ID token and sign the user in (or create an account)."""
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    from app.config import settings

    try:
        idinfo = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise UnauthorizedException("Invalid Google token.")

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "")
    first_name = idinfo.get("given_name", "")
    last_name = idinfo.get("family_name", "")
    if not email:
        raise BadRequestException("Google account has no email address.")

    # Look up existing user by google_id first, then email
    user = db.query(User).filter(User.google_id == google_sub).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link Google to existing email account
            user.google_id = google_sub
            db.commit()

    if not user:
        # Create a new account
        if role not in ("patient", "dentist"):
            role = "patient"
        user = User(
            email=email,
            hashed_password=None,
            google_id=google_sub,
            first_name=first_name,
            last_name=last_name,
            role=UserRole(role),
            is_email_verified=True,
        )
        db.add(user)
        db.flush()
        if role == "patient":
            db.add(Patient(id=uuid.uuid4(), user_id=user.id))
        elif role == "dentist":
            auto_approve = getattr(settings, "DEBUG", False)
            db.add(Dentist(id=uuid.uuid4(), user_id=user.id, is_approved=bool(auto_approve)))
        db.commit()
        db.refresh(user)

    access = create_access_token(str(user.id), user.role)
    refresh = create_refresh_token(str(user.id))
    return {"user": _serialize_user(user), "access_token": access, "refresh_token": refresh}
