from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

class PatientCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

class PatientResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class ImageAnalysisSchema(BaseModel):
    uuid: str
    prediction: str
    confidence: float
    all_probabilities: Dict[str, float]
    processing_time_ms: float
    analyzed_at: datetime
    explanation: Dict[str, Any]
    pdf_path: Optional[str] = None
    
    class Config:
        from_attributes = True

class PatientImageSchema(BaseModel):
    uuid: str
    original_name: str
    file_size: int
    uploaded_at: datetime
    analysis: Optional[ImageAnalysisSchema] = None
    
    class Config:
        from_attributes = True

class PatientWithImagesResponse(PatientResponse):
    images: List[PatientImageSchema] = []

class PatientReportSchema(BaseModel):
    uuid: str
    prediction: str
    confidence: float
    risk_level: str
    generated_at: datetime
    analysis_id: str
    
    class Config:
        from_attributes = True

class PatientReportDetailSchema(PatientReportSchema):
    explanation: Dict[str, Any]
    recommendations: List[str]

class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    username: str
    password: str

class UploadImageResponse(BaseModel):
    message: str
    image_id: str
    filename: str
    uploaded_at: str
    
    class Config:
        from_attributes = True

class ImagesListResponse(BaseModel):
    images: List[Dict[str, Any]]
    
    class Config:
        from_attributes = True

class ReportsListResponse(BaseModel):
    reports: List[Dict[str, Any]]
    
    class Config:
        from_attributes = True

class FindingDetail(BaseModel):
    condition: str
    confidence: float
    confidence_percentage: float
    level: str

class DifferentialDiagnosis(BaseModel):
    condition: str
    confidence: float

class AIGeneratedExplanation(BaseModel):
    condition: str
    confidence_percentage: float
    risk_level: str
    urgency: str
    ai_generated: bool
    explanation: str
    recommendations: Optional[List[str]] = None
    differential: List[DifferentialDiagnosis]

class UploadAnalysisDetails(BaseModel):
    id: str
    primary_finding: FindingDetail
    all_findings: List[FindingDetail]
    explanation: AIGeneratedExplanation
    analysis_time_ms: float

class UploadImageWithAnalysisResponse(BaseModel):
    success: bool
    message: str
    data: Dict[str, Any]
    
    class Config:
        from_attributes = True