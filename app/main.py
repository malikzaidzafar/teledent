from fastapi import FastAPI
from app.database import engine, Base
from app.routers import patients, auth

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FastAPI PostgreSQL Demo",
    description="Learning FastAPI with proper structure",
    version="1.0.0"
)

app.include_router(patients.router)
app.include_router(auth.router)

@app.get("/")
def root():
    return {
        "message": "Welcome to FastAPI",
        "docs": "/docs",
        "endpoints": [
            "/patients/register",
            "/patients/get_all_patients",
            "/patients/deletepatient/{patient_id}",
            "/auth/login",
            "/auth/me"
        ]
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "connected"}