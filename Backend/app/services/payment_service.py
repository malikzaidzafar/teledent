"""
services/payment_service.py — Stripe PaymentIntent creation + webhook handling.

In TEST MODE:
  - Use card 4242 4242 4242 4242, any future date, any CVC.
  - No real money is ever charged.
  - Get test keys at https://dashboard.stripe.com/test/apikeys
"""
import uuid
import stripe
from sqlalchemy.orm import Session

from app.config import settings
from app.models.payment import Payment, PaymentStatus
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus
from app.core.exceptions import NotFoundException, ConflictException, ForbiddenException


def _stripe():
    """Return configured stripe module. Raises if secret key not set."""
    if not settings.STRIPE_SECRET_KEY or settings.STRIPE_SECRET_KEY.startswith("sk_test_REPLACE"):
        raise ConflictException(
            "Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file. "
            "Get test keys at https://dashboard.stripe.com/test/apikeys"
        )
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def create_payment_intent(db: Session, appointment_id: str, user_id: str) -> dict:
    """
    Create (or return existing) Stripe PaymentIntent for an appointment.
    Idempotent — calling twice returns the same intent.
    """
    # Resolve patient
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise NotFoundException("Patient profile", user_id)

    # Resolve appointment
    appt = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appt:
        raise NotFoundException("Appointment", appointment_id)
    if str(appt.patient_id) != str(patient.id):
        raise ForbiddenException()

    # Return existing pending payment if already created
    existing = db.query(Payment).filter(Payment.appointment_id == appointment_id).first()
    if existing and existing.status == PaymentStatus.pending:
        return _payment_response(existing)
    if existing and existing.status == PaymentStatus.succeeded:
        raise ConflictException("This appointment has already been paid.")

    amount = settings.CONSULTATION_FEE_CENTS
    currency = settings.PAYMENT_CURRENCY

    # Create Stripe PaymentIntent
    s = _stripe()
    intent = s.PaymentIntent.create(
        amount=amount,
        currency=currency,
        metadata={
            "appointment_id": appointment_id,
            "patient_id": str(patient.id),
        },
        description=f"Teledent video consultation — appointment {appointment_id}",
        automatic_payment_methods={"enabled": True},
    )

    payment = Payment(
        id=uuid.uuid4(),
        appointment_id=appointment_id,
        patient_id=patient.id,
        stripe_payment_intent_id=intent["id"],
        stripe_client_secret=intent["client_secret"],
        amount_cents=amount,
        currency=currency,
        status=PaymentStatus.pending,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return _payment_response(payment)


def get_payment_status(db: Session, appointment_id: str, user_id: str) -> dict:
    patient = db.query(Patient).filter(Patient.user_id == user_id).first()
    if not patient:
        raise NotFoundException("Patient profile", user_id)

    payment = db.query(Payment).filter(Payment.appointment_id == appointment_id).first()
    if not payment:
        return {
            "appointment_id": appointment_id,
            "status": "not_created",
            "amount_cents": settings.CONSULTATION_FEE_CENTS,
            "currency": settings.PAYMENT_CURRENCY,
            "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
        }
    if str(payment.patient_id) != str(patient.id):
        raise ForbiddenException()
    return _payment_response(payment)


def handle_webhook(payload: bytes, sig_header: str, db: Session):
    """
    Verify and process incoming Stripe webhook events.
    Call from POST /payments/webhook (raw bytes, no JSON parsing).
    """
    s = _stripe()
    try:
        event = s.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise ForbiddenException()

    if event["type"] == "payment_intent.succeeded":
        _mark_succeeded(db, event["data"]["object"]["id"])
    elif event["type"] in ("payment_intent.payment_failed", "payment_intent.canceled"):
        _mark_failed(db, event["data"]["object"]["id"])

    return {"received": True}


def _mark_succeeded(db: Session, stripe_intent_id: str):
    payment = db.query(Payment).filter(
        Payment.stripe_payment_intent_id == stripe_intent_id
    ).first()
    if not payment:
        return
    payment.status = PaymentStatus.succeeded
    # Confirm appointment
    appt = db.query(Appointment).filter(Appointment.id == payment.appointment_id).first()
    if appt:
        appt.status = AppointmentStatus.confirmed
    db.commit()


def _mark_failed(db: Session, stripe_intent_id: str):
    payment = db.query(Payment).filter(
        Payment.stripe_payment_intent_id == stripe_intent_id
    ).first()
    if not payment:
        return
    payment.status = PaymentStatus.failed
    db.commit()


def _payment_response(payment: Payment) -> dict:
    return {
        "payment_id": str(payment.id),
        "appointment_id": str(payment.appointment_id),
        "status": payment.status.value if hasattr(payment.status, "value") else str(payment.status),
        "amount_cents": payment.amount_cents,
        "currency": payment.currency,
        "client_secret": payment.stripe_client_secret,
        "publishable_key": settings.STRIPE_PUBLISHABLE_KEY,
    }
