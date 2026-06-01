"""
main.py — FastAPI app factory. Registers routers, exception handlers, middleware.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

from app.config import settings
from app.database import Base, engine
import app.models  # noqa: F401 — registers all ORM models with metadata
from app.core.exceptions import (
    AppException, app_exception_handler,
    validation_exception_handler, generic_exception_handler,
)
from app.routers import auth, patients, scans, reports, appointments, video, files, dentists, admin_stats, messages

# Create tables (replace with Alembic migrations in production)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        settings.FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Exception handlers ---
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# --- Routers ---
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(scans.router)
app.include_router(reports.router)
app.include_router(appointments.router)
app.include_router(video.router)
app.include_router(files.router)
app.include_router(dentists.router)
app.include_router(admin_stats.router)
app.include_router(messages.router)


@app.get("/", tags=["Health"])
def root():
    return {"service": settings.APP_NAME, "version": settings.APP_VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}