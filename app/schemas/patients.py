from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    username: str
    password: str

class PatientCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

class PatientResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    image_history: Optional[List[Dict[str, Any]]] = []
    report_history: Optional[List[Dict[str, Any]]] = []
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True