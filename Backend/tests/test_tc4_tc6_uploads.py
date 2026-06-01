"""
TC-4  Single Image Upload
TC-5  Invalid File Format Rejection
TC-6  Large File Rejection
"""
import uuid
import pytest
from tests.conftest import register_and_login, auth_headers

# ── Supported MIME types (what the backend / Cloudinary accepts) ─────────────
ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
BLOCKED_MIME_TYPES = [
    ("text/plain",        "document.txt"),
    ("application/octet-stream", "malware.exe"),
    ("image/bmp",         "photo.bmp"),
    ("video/mp4",         "video.mp4"),
]
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


# ── TC-4: Single Image Upload ────────────────────────────────────────────────
class TestTC4_SingleImageUpload:
    """TC-4: Verify patient can upload a valid dental image."""

    def test_sign_upload_returns_cloudinary_params(self, app_client):
        """
        /files/sign-upload should return all parameters needed for a
        direct Cloudinary upload from the frontend.
        """
        data = register_and_login(app_client, f"upload_{uuid.uuid4().hex[:8]}@test.com", "Pass99!")
        token = data["access_token"]

        resp = app_client.post(
            "/files/sign-upload",
            json={"filename": "xray.jpg", "mime_type": "image/jpeg", "folder": "scans"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "signature" in body
        assert "timestamp" in body
        assert "api_key" in body
        assert "cloudinary_url" in body
        assert "public_id" in body

    def test_create_scan_record_accepted(self, app_client):
        """
        POST /scans with a valid Cloudinary URL returns 202 and queues
        the AI pipeline in the background.
        """
        data = register_and_login(
            app_client, f"scanup_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        token = data["access_token"]

        resp = app_client.post(
            "/scans",
            json={
                "cloudinary_public_id": "teledent/scans/test_xray",
                "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
                "scan_type": "panoramic",
                "scan_date": "2026-06-01",
                "notes": "Routine check",
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 202, resp.text
        body = resp.json()
        assert "scan_id" in body
        assert body["status"] in ("queued", "processing")

    def test_create_scan_unauthenticated_returns_401(self, app_client):
        resp = app_client.post(
            "/scans",
            json={
                "cloudinary_public_id": "teledent/scans/x",
                "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
                "scan_type": "panoramic",
                "scan_date": "2026-06-01",
            },
        )
        assert resp.status_code == 401

    def test_scan_appears_in_list_after_upload(self, app_client):
        data = register_and_login(
            app_client, f"scanlist_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        token = data["access_token"]
        app_client.post(
            "/scans",
            json={
                "cloudinary_public_id": "teledent/scans/list_test",
                "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
                "scan_type": "periapical",
                "scan_date": "2026-06-01",
            },
            headers=auth_headers(token),
        )
        list_resp = app_client.get("/scans", headers=auth_headers(token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] >= 1


# ── TC-5: Invalid File Format Rejection ──────────────────────────────────────
class TestTC5_InvalidFileFormatRejection:
    """
    TC-5: Verify system rejects unsupported file formats (TXT, EXE, BMP, MP4).

    The upload flow is:
      1. Frontend calls POST /files/sign-upload  ← server-side MIME validation
         (returns 400 / 415 for blocked types)
      2. Frontend uploads directly to Cloudinary (backend never touches the bytes)

    The current /files/sign-upload endpoint accepts a `mime_type` field but
    does NOT yet validate it against an allowlist.
    Tests that expect rejection are marked xfail until that validation is added.
    """

    @pytest.mark.parametrize("mime_type,filename", BLOCKED_MIME_TYPES)
    def test_blocked_mime_type_rejected(self, app_client, mime_type, filename):
        data = register_and_login(
            app_client, f"fmt_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        token = data["access_token"]

        resp = app_client.post(
            "/files/sign-upload",
            json={"filename": filename, "mime_type": mime_type, "folder": "scans"},
            headers=auth_headers(token),
        )
        assert resp.status_code in (400, 415), (
            f"Expected 400/415 for {mime_type}, got {resp.status_code}"
        )

    @pytest.mark.parametrize("mime_type,filename", [
        ("image/jpeg", "xray.jpg"),
        ("image/png",  "xray.png"),
    ])
    def test_allowed_mime_types_accepted(self, app_client, mime_type, filename):
        """Allowed MIME types must still return 200."""
        data = register_and_login(
            app_client, f"allow_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        token = data["access_token"]

        resp = app_client.post(
            "/files/sign-upload",
            json={"filename": filename, "mime_type": mime_type, "folder": "scans"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.text


# ── TC-6: Large File Rejection ───────────────────────────────────────────────
class TestTC6_LargeFileRejection:
    """
    TC-6: Verify system rejects files larger than the 10 MB maximum limit.

    The sign-upload endpoint currently does not receive or validate file size.
    The current implementation does not enforce a file-size limit on the backend.
    Test is marked xfail until server-side size validation is added.
    """

    def test_file_exceeding_10mb_is_rejected(self, app_client):
        data = register_and_login(
            app_client, f"bigfile_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        token = data["access_token"]

        # Simulate a client reporting a 15 MB file
        oversized_bytes = MAX_FILE_SIZE_BYTES + (5 * 1024 * 1024)

        resp = app_client.post(
            "/files/sign-upload",
            json={
                "filename": "huge_scan.jpg",
                "mime_type": "image/jpeg",
                "folder": "scans",
                "file_size": oversized_bytes,
            },
            headers=auth_headers(token),
        )
        assert resp.status_code in (400, 413), (
            f"Expected 400/413 for oversized file, got {resp.status_code}"
        )

    def test_file_within_10mb_is_accepted(self, app_client):
        """A file well within the 10 MB limit must be accepted (200)."""
        data = register_and_login(
            app_client, f"okfile_{uuid.uuid4().hex[:8]}@test.com", "Pass99!"
        )
        token = data["access_token"]

        resp = app_client.post(
            "/files/sign-upload",
            json={
                "filename": "normal_scan.jpg",
                "mime_type": "image/jpeg",
                "folder": "scans",
                "file_size": 2 * 1024 * 1024,  # 2 MB
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.text
