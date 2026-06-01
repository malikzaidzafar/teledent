"""
conftest.py — Shared fixtures for all test cases.

Uses a SQLite file-based database so no running PostgreSQL is required.
Mocks out external services (Cloudinary, YOLO, Gemini, LiveKit, PDF, Email)
so tests are fast, deterministic, and run fully offline.
"""
import uuid
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# ── Patch PostgreSQL-specific types → SQLite-compatible equivalents ───────────
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler as _STC  # noqa: E402
# JSONB → TEXT (stored as JSON string)
if not hasattr(_STC, "visit_JSONB"):
    _STC.visit_JSONB = lambda self, type_, **kw: "TEXT"
# PostgreSQL UUID → CHAR(36)
if not hasattr(_STC, "visit_UUID"):
    _STC.visit_UUID = lambda self, type_, **kw: "CHAR(36)"

# Make SQLAlchemy's UUID type return strings (not Python uuid.UUID objects)
# when queried from SQLite, preventing 'str has no attribute hex' errors.
from sqlalchemy.dialects.postgresql import UUID as _PG_UUID  # noqa: E402
from sqlalchemy import String as _String  # noqa: E402

# Monkey-patch result_processor so UUIDs read back as str from SQLite
_orig_result_processor = _PG_UUID.result_processor

def _uuid_result_processor(self, dialect, coltype):
    if dialect.name == "sqlite":
        return None  # return raw string from SQLite
    return _orig_result_processor(self, dialect, coltype)

_PG_UUID.result_processor = _uuid_result_processor

# Monkey-patch bind_processor so Python uuid.UUID objects serialise to str for SQLite
_orig_bind_processor = _PG_UUID.bind_processor

def _uuid_bind_processor(self, dialect):
    if dialect.name == "sqlite":
        def process(value):
            if value is None:
                return None
            return str(value)
        return process
    return _orig_bind_processor(self, dialect)

_PG_UUID.bind_processor = _uuid_bind_processor

# ── SQLite file-based engine (overrides PostgreSQL for tests) ─────────────────
SQLITE_URL = "sqlite:///./test_teledent.db"

test_engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


# ── Override DB dependency BEFORE importing app ──────────────────────────────
from app.database import Base, get_db  # noqa: E402

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Patch database.engine so Base.metadata.create_all uses SQLite
import app.database as _db_module  # noqa: E402
_db_module.engine = test_engine
_db_module.SessionLocal = TestingSessionLocal

# Also patch the scan_service's SessionLocal reference
import app.database as _db_mod2  # noqa: E402
_db_mod2.SessionLocal = TestingSessionLocal


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Drop and recreate all tables in SQLite once per test session."""
    # Import all models to register them with Base.metadata
    import app.models  # noqa: F401
    Base.metadata.drop_all(bind=test_engine)   # always start fresh
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def db():
    """Per-test database session with rollback after each test."""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="session")
def app_client():
    """
    TestClient with DB override and all external services mocked at session scope.
    Patches are kept alive for the entire test session.
    """
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db

    # Mock Cloudinary upload / sign
    mock_cloudinary = MagicMock()
    mock_cloudinary.uploader.upload.return_value = {
        "secure_url": "https://res.cloudinary.com/test/image/upload/test.jpg",
        "public_id": "teledent/scans/test",
    }
    mock_cloudinary.uploader.destroy.return_value = {"result": "ok"}

    # Mock YOLO detection
    mock_yolo_result = {
        "detections": [
            {
                "class": "Caries",
                "confidence": 0.91,
                "bbox": [10, 20, 100, 120],
            }
        ],
        "annotated_image_url": "https://res.cloudinary.com/test/annotated.jpg",
    }

    # Mock Gemini / Vision enrichment
    mock_gemini_result = {
        "findings_enriched": [
            {
                "severity": "high",
                "gemini_explanation": "Cavity detected in lower left molar.",
                "recommendation": "Schedule filling appointment.",
            }
        ],
        "patient_summary": "A cavity was detected. Please consult your dentist.",
        "clinical_notes": "Caries present in lower left molar region.",
        "overall_risk": "high",
        "urgency": "soon",
        "image_quality": "good",
    }

    # Mock PDF generation
    mock_pdf_url = "https://res.cloudinary.com/test/reports/report.pdf"

    patches = [
        patch("app.services.yolo_service.run_detection", return_value=mock_yolo_result),
        patch(
            "app.services.vision_service.DentalVisionService.analyze_with_yolo_context",
            return_value=mock_gemini_result,
        ),
        patch(
            "app.services.pdf_service.generate_report_pdf",
            return_value=b"%PDF mock",
        ),
        patch(
            "app.services.pdf_service.upload_pdf_to_cloudinary",
            return_value=mock_pdf_url,
        ),
        patch("app.services.email_service.send_reset_email"),
        patch("app.services.image_preprocessing_service.preprocess_image", side_effect=lambda b: b),
        # livekit token stub (already handled in video_service via try/except)
    ]

    started = [p.start() for p in patches]
    with TestClient(app) as client:
        yield client

    for p in patches:
        p.stop()

    app.dependency_overrides.clear()


# ── Reusable helper ──────────────────────────────────────────────────────────

def register_and_login(client: TestClient, email: str, password: str, role: str = "patient") -> dict:
    """Register a user and return tokens + user info."""
    resp = client.post("/auth/register", json={
        "email": email,
        "password": password,
        "first_name": "Test",
        "last_name": "User",
        "role": role,
    })
    assert resp.status_code == 201, f"Register failed: {resp.json()}"
    return resp.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
