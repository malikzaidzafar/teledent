"""
services/email_service.py — Resend-based transactional email service.
"""
import logging
import resend
from app.config import settings

logger = logging.getLogger(__name__)

resend.api_key = settings.RESEND_API_KEY

FROM_ADDRESS = settings.EMAIL_FROM


def _safe_send(payload: dict) -> None:
    """Wrap resend.Emails.send with error handling so email failures never crash business logic."""
    try:
        resend.Emails.send(payload)
    except Exception as exc:
        logger.error("Email send failed to %s: %s", payload.get("to"), exc)


def send_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password-reset link to the user."""
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "Reset your Teledent password",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Password Reset</h2>
          <p>Click the button below to reset your password. This link expires in
             {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>
          <a href="{reset_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
          <p style="margin-top:24px;color:#6b7280;font-size:13px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        """,
    })


def send_dentist_invite_email(to_email: str, first_name: str, temp_password: str) -> None:
    """Send an invitation email to a newly created dentist account."""
    login_url = f"{settings.FRONTEND_URL}/login"
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "You've been invited to Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Welcome to Teledent, {first_name}!</h2>
          <p>An administrator has created a dentist account for you.</p>
          <p><strong>Email:</strong> {to_email}<br>
             <strong>Temporary Password:</strong>
             <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">
               {temp_password}
             </code>
          </p>
          <p>Please log in and change your password immediately.</p>
          <a href="{login_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Log In
          </a>
        </div>
        """,
    })


# ---------------------------------------------------------------------------
# Appointment lifecycle emails (A4 / C3)
# ---------------------------------------------------------------------------

def send_appointment_booked_email(patient_email: str, patient_name: str, dentist_name: str, scheduled_at: str) -> None:
    """Sent to patient + dentist when a new appointment is booked."""
    appointments_url = f"{settings.FRONTEND_URL}/patient/appointments"
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [patient_email],
        "subject": "Appointment Booking Confirmed — Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Your appointment has been booked!</h2>
          <p>Hi {patient_name},</p>
          <p>Your appointment with <strong>{dentist_name}</strong> has been scheduled for
             <strong>{scheduled_at}</strong>. It is currently <em>pending confirmation</em>
             by the dentist.</p>
          <a href="{appointments_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            View Appointment
          </a>
        </div>
        """,
    })


def send_appointment_booked_dentist_email(dentist_email: str, dentist_name: str, patient_name: str, scheduled_at: str) -> None:
    """Notify dentist of a new incoming appointment request."""
    appointments_url = f"{settings.FRONTEND_URL}/dentist/appointments"
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [dentist_email],
        "subject": f"New appointment request from {patient_name} — Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>New Appointment Request</h2>
          <p>Hi {dentist_name},</p>
          <p><strong>{patient_name}</strong> has requested an appointment on
             <strong>{scheduled_at}</strong>. Please confirm or reject it.</p>
          <a href="{appointments_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Review Request
          </a>
        </div>
        """,
    })


def send_appointment_confirmed_email(patient_email: str, patient_name: str, dentist_name: str, scheduled_at: str) -> None:
    """B2: Notify patient when dentist confirms the appointment."""
    appointments_url = f"{settings.FRONTEND_URL}/patient/appointments"
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [patient_email],
        "subject": "Appointment Confirmed — Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Your appointment is confirmed!</h2>
          <p>Hi {patient_name},</p>
          <p><strong>{dentist_name}</strong> has confirmed your appointment for
             <strong>{scheduled_at}</strong>.</p>
          <a href="{appointments_url}"
             style="display:inline-block;padding:12px 24px;background:#16a34a;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Join Appointment
          </a>
        </div>
        """,
    })


def send_appointment_cancelled_email(to_email: str, recipient_name: str, other_party_name: str, scheduled_at: str, cancelled_by: str) -> None:
    """Notify both parties when an appointment is cancelled or rejected."""
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "Appointment Cancelled — Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Appointment Cancelled</h2>
          <p>Hi {recipient_name},</p>
          <p>Your appointment with <strong>{other_party_name}</strong> on
             <strong>{scheduled_at}</strong> has been cancelled by {cancelled_by}.</p>
          <p style="color:#6b7280;font-size:13px">If you have questions, please contact support.</p>
        </div>
        """,
    })


def send_appointment_completed_email(patient_email: str, patient_name: str, dentist_name: str) -> None:
    """Notify patient that their appointment is marked complete with a link to view their report."""
    reports_url = f"{settings.FRONTEND_URL}/patient/reports"
    _safe_send({
        "from": FROM_ADDRESS,
        "to": [patient_email],
        "subject": "Consultation Complete — Your Report is Ready — Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Consultation Complete</h2>
          <p>Hi {patient_name},</p>
          <p>Your consultation with <strong>{dentist_name}</strong> is complete.
             Your report is available in the patient portal.</p>
          <a href="{reports_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            View Report
          </a>
        </div>
        """,
    })


def send_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password-reset link to the user."""
    resend.Emails.send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "Reset your Teledent password",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Password Reset</h2>
          <p>Click the button below to reset your password. This link expires in
             {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>
          <a href="{reset_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
          <p style="margin-top:24px;color:#6b7280;font-size:13px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        """,
    })


def send_dentist_invite_email(to_email: str, first_name: str, temp_password: str) -> None:
    """Send an invitation email to a newly created dentist account."""
    login_url = f"{settings.FRONTEND_URL}/login"
    resend.Emails.send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": "You've been invited to Teledent",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Welcome to Teledent, {first_name}!</h2>
          <p>An administrator has created a dentist account for you.</p>
          <p><strong>Email:</strong> {to_email}<br>
             <strong>Temporary Password:</strong>
             <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">
               {temp_password}
             </code>
          </p>
          <p>Please log in and change your password immediately.</p>
          <a href="{login_url}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;
                    color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Log In
          </a>
        </div>
        """,
    })
