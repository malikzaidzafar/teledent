"""
services/cloudinary_service.py — Signed upload params + deletion.
"""
import hashlib, time
from app.config import settings


def generate_signed_upload_params(folder: str, public_id: str = None) -> dict:
    """
    Returns the signed params the client uses to upload directly to Cloudinary.
    Backend never handles the file bytes.
    """
    timestamp = int(time.time())
    # Always generate a deterministic public_id and include it in the signature
    resolved_public_id = public_id or f"teledent/{folder}/{timestamp}"
    params = {
        "timestamp": timestamp,
        "folder": f"teledent/{folder}",
        "public_id": resolved_public_id,
    }

    # Build signature string — ALL params that will be sent must be included here
    param_str = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    signature = hashlib.sha1(f"{param_str}{settings.CLOUDINARY_API_SECRET}".encode()).hexdigest()

    return {
        "cloudinary_url": f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/image/upload",
        "api_key": settings.CLOUDINARY_API_KEY,
        "timestamp": timestamp,
        "signature": signature,
        "folder": params["folder"],
        "public_id": resolved_public_id,
    }


def delete_resource(public_id: str, resource_type: str = "image"):
    """
    Calls Cloudinary destroy API server-side.
    TODO: use cloudinary SDK: cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    """
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
        )
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)
    except Exception as e:
        # TODO: log error properly
        print(f"[Cloudinary] Failed to delete {public_id}: {e}")
