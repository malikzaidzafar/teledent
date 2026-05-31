"""
core/dependencies.py — FastAPI dependency injection.
get_current_user, require_role guards used in routers.
"""
from fastapi import Depends, Header
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.security import decode_token
from app.core.exceptions import UnauthorizedException, ForbiddenException
from app.models.user import User


def get_token(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedException("Missing or malformed Authorization header.")
    return authorization.split(" ", 1)[1]


def get_current_user(token: str = Depends(get_token), db: Session = Depends(get_db)) -> User:
    """
    Decodes JWT, loads user from DB.
    """
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise UnauthorizedException("Invalid or expired access token.")

    user_id: str = payload.get("sub")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise UnauthorizedException("User not found or deactivated.")
    return user


def require_role(*roles: str):
    """
    Usage: Depends(require_role("admin", "dentist"))
    """
    def _check(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise ForbiddenException(f"Role '{current_user.role}' is not allowed here.")
        return current_user
    return _check
