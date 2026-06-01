from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Teledent AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    BASE_URL: str = "https://api.teledent.ai/v1"

    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/teledent"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Redis (for refresh token blacklist)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # LiveKit
    LIVEKIT_URL: str = "wss://teledent.livekit.cloud"
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    # Email (Resend)
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@teledent.ai"
    FRONTEND_URL: str = "https://teledent.ai"

    # AI
    GEMINI_API_KEY: str = ""
    YOLO_MODEL_PATH: str = ""  # Override path to best.pt; auto-resolved if empty

    # Stripe payments
    STRIPE_SECRET_KEY: str = ""          # sk_test_...
    STRIPE_PUBLISHABLE_KEY: str = ""   # pk_test_...
    STRIPE_WEBHOOK_SECRET: str = ""    # whsec_...
    PAYMENT_CURRENCY: str = "usd"
    CONSULTATION_FEE_CENTS: int = 2500  # $25.00 default

    # Rate limiting
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_SCAN: str = "5/minute"
    RATE_LIMIT_GENERAL: str = "120/minute"
    RATE_LIMIT_ADMIN: str = "300/minute"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
