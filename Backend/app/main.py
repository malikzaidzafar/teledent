from Backend.app.routers import admin
from fastapi import FastAPI
from Backend.app.database import engine, Base
from Backend.app.routers import patients

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FastAPI PostgreSQL Demo",
    description="Learning FastAPI with proper structure",
    version="1.0.0"
)

app.include_router(patients.router)
app.include_router(admin.router)

@app.get("/")
def root():
    return {
        "message": "Welcome to FastAPI",
        "docs": "/docs",
        "endpoints": [
            "/patients/register",
            "/admin/get_all_patients",
            "/admin/deletepatient/{patient_id}",
            "/admin/patients"
        ]
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "connected"}