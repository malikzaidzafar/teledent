"""
routers/files.py — Cloudinary signed upload + deletion.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.core.dependencies import get_current_user
from app.services.cloudinary_service import generate_signed_upload_params, delete_resource

router = APIRouter(prefix="/files", tags=["Files"])


class SignUploadIn(BaseModel):
    filename: str
    mime_type: str
    folder: str = "scans"


@router.post("/sign-upload")
def sign_upload(body: SignUploadIn, _=Depends(get_current_user)):
    return generate_signed_upload_params(folder=body.folder)


@router.delete("/{public_id:path}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(public_id: str, _=Depends(get_current_user)):
    delete_resource(public_id)
