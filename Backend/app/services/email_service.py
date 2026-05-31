"""
services/email_service.py — Resend-based transactional email service.
"""
import resend
from app.config import settings

resend.api_key = settings.RESEND_API_KEY

FROM_ADDRESS = settings.EMAIL_FROM


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
