from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
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

    image_history = Column(JSONB, default=list)  
    report_history = Column(JSONB, default=list)

    def set_password(self, plain_password: str):
        self.password = get_password_hash(plain_password)

    def check_password(self, plain_password: str) -> bool:
        return verify_password(plain_password, self.password)
    
