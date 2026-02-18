from fastapi import FastAPI
from app.database import engine, Base
from app.models import user  
from app.routers import users

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FastAPI PostgreSQL Demo",
    description="Learning FastAPI with proper structure",
    version="1.0.0"
)

app.include_router(users.router)

@app.get("/")
def root():
    return {
        "message": "Welcome to FastAPI",
        "docs": "/docs",
        "endpoints": ["/users"]
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "connected"}