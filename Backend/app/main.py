"""
main.py — FastAPI app factory. Registers routers, exception handlers, middleware.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    limiter = Limiter(key_func=get_remote_address)
    RATE_LIMIT_AVAILABLE = True
except ImportError:
    RATE_LIMIT_AVAILABLE = False
    limiter = None

import cloudinary
from app.config import settings
from app.database import Base, engine
import app.models  # noqa: F401 — registers all ORM models with metadata
from app.core.exceptions import (
    AppException, app_exception_handler,
    validation_exception_handler, generic_exception_handler,
)
from app.routers import auth, patients, scans, reports, appointments, video, files, dentists, admin_stats, messages, payments, notifications, admin, ws

# Configure Cloudinary once at startup
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)

# Create tables (replace with Alembic migrations in production)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# --- CORS ---
# G7: Only allow requests from the production frontend and local dev origins
_allowed_origins = [settings.FRONTEND_URL]
if settings.DEBUG:
    _allowed_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# --- Exception handlers ---
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# G9: Rate limiting
if RATE_LIMIT_AVAILABLE:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Routers ---
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(scans.router)
app.include_router(reports.router)
app.include_router(appointments.router)
app.include_router(video.router)
app.include_router(notifications.router)
app.include_router(files.router)
app.include_router(dentists.router)
app.include_router(admin_stats.router)
app.include_router(messages.router)
app.include_router(payments.router)
app.include_router(admin.router)
app.include_router(ws.router)


@app.get("/", tags=["Health"])
def root():
    return {"service": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}