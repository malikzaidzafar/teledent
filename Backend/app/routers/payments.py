"""
routers/payments.py — Stripe payment endpoints.
"""
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.services import payment_service

router = APIRouter(prefix="/payments", tags=["Payments"])


class CreateIntentIn(BaseModel):
    appointment_id: str


@router.post(
    "/create-intent",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("patient"))],
)
def create_intent(
    body: CreateIntentIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Stripe PaymentIntent for an appointment. Returns client_secret for frontend."""
    return payment_service.create_payment_intent(db, body.appointment_id, str(current_user.id))


@router.get("/status/{appointment_id}", dependencies=[Depends(require_role("patient"))])
def payment_status(
    appointment_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check payment status for an appointment (also returns publishable_key)."""
    return payment_service.get_payment_status(db, appointment_id, str(current_user.id))


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Stripe sends signed POST events here.
    Register this URL in Stripe Dashboard → Webhooks.
    For local dev use: stripe listen --forward-to localhost:8000/payments/webhook
    """
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    return payment_service.handle_webhook(payload, sig, db)
