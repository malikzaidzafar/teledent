from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

class ImageInfo(BaseModel):
    id: str
    original_name: str
    uploaded_at: datetime  
    size: int
    url: str
    
    class Config:
        from_attributes = True

class ImagesListResponse(BaseModel):
    images: List[ImageInfo]
    
    class Config:
        from_attributes = True

class UploadImageResponse(BaseModel):
    message: str
    image_id: str
    filename: str
    uploaded_at: str
    
    class Config:
        from_attributes = True

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

class AnalysisResponse(BaseModel):
    analysis_id: str
    image_id: str
    prediction: str  
    confidence: float
    description: str
    analyzed_at: datetime
    
    class Config:
        from_attributes = True

class ReportResponse(BaseModel):
    report_id: str
    analysis_id: str
    prediction: str
    confidence: float
    explanation: str
    risk_level: str 
    recommendations: List[str]
    generated_at: datetime
    
    class Config:
        from_attributes = True


class ReportListItem(BaseModel):
    report_id: str
    prediction: str
    confidence: float
    risk_level: str
    generated_at: str
    url: str

class ReportsListResponse(BaseModel):
    reports: List[ReportListItem]
    
class ReportDetailResponse(BaseModel):
    id: str
    analysis_id: str
    prediction: str
    confidence: float
    explanation: str
    risk_level: str
    recommendations: List[str]
    generated_at: str