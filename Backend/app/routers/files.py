"""
routers/files.py — Cloudinary signed upload + deletion.
"""
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.core.dependencies import get_current_user
from app.services.cloudinary_service import generate_signed_upload_params, delete_resource

router = APIRouter(prefix="/files", tags=["Files"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


class SignUploadIn(BaseModel):
    filename: str
    mime_type: str
    folder: str = "scans"
    file_size: Optional[int] = None


@router.post("/sign-upload")
def sign_upload(body: SignUploadIn, _=Depends(get_current_user)):
    if body.mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{body.mime_type}'. Allowed: jpeg, png, webp.",
        )
    if body.file_size is not None and body.file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({body.file_size} bytes). Maximum allowed size is 10 MB.",
        )
    return generate_signed_upload_params(folder=body.folder)


@router.delete("/{public_id:path}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(public_id: str, _=Depends(get_current_user)):
    delete_resource(public_id)
