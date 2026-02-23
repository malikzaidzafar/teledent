from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base
from app.utils.utils import get_password_hash, verify_password

class Admin(Base):
    __tablename__ = "admins"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    

    def set_password(self, plain_password: str):
        self.password = get_password_hash(plain_password)

    def check_password(self, plain_password: str) -> bool:
        return verify_password(plain_password, self.password)