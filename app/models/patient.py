from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from app.utils.utils import get_password_hash, verify_password


class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    images = relationship("PatientImage", back_populates="patient", cascade="all, delete-orphan")
    reports = relationship("PatientReport", back_populates="patient", cascade="all, delete-orphan")

    def set_password(self, plain_password: str):
        self.password = get_password_hash(plain_password)

    def check_password(self, plain_password: str) -> bool:
        return verify_password(plain_password, self.password)


class PatientImage(Base):
    __tablename__ = "patient_images"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    
    patient = relationship("Patient", back_populates="images")
    analysis = relationship("ImageAnalysis", back_populates="image", uselist=False, cascade="all, delete-orphan")


class ImageAnalysis(Base):
    __tablename__ = "image_analyses"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True, nullable=False)
    image_id = Column(Integer, ForeignKey("patient_images.id"), nullable=False)
    prediction = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    all_probabilities = Column(JSONB, nullable=False)
    processing_time_ms = Column(Float, nullable=False)
    analyzed_at = Column(DateTime(timezone=True), server_default=func.now())
    explanation = Column(JSONB, nullable=False)
    pdf_path = Column(String)
    
    image = relationship("PatientImage", back_populates="analysis")
    report = relationship("PatientReport", back_populates="analysis", uselist=False, cascade="all, delete-orphan")


class PatientReport(Base):
    __tablename__ = "patient_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    analysis_id = Column(Integer, ForeignKey("image_analyses.id"), nullable=False)
    pdf_path = Column(String, nullable=False) 
    prediction = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    explanation = Column(JSONB, nullable=False)
    risk_level = Column(String, nullable=False)
    recommendations = Column(JSONB, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    
    patient = relationship("Patient", back_populates="reports")
    analysis = relationship("ImageAnalysis", back_populates="report")