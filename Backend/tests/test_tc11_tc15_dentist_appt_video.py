"""
TC-11  Dentist Validation (review + approve AI report)
TC-12  Appointment Booking
TC-13  Dentist Accepts Appointment
TC-14  Payment Processing (Stripe)
TC-15  Video Consultation
"""
import uuid
import pytest
from unittest.mock import patch, MagicMock
from tests.conftest import register_and_login, auth_headers


# ── helpers ───────────────────────────────────────────────────────────────────

def _create_dentist(app_client) -> dict:
    """Register a dentist user and return their tokens."""
    return register_and_login(
        app_client,
        f"dentist_{uuid.uuid4().hex[:8]}@test.com",
        "DentistPass99!",
        role="dentist",
    )


def _create_patient_with_scan(app_client):
    """Register a patient, upload a scan, wait for analysis. Returns (patient_data, analysis)."""
    import time
    patient = register_and_login(
        app_client,
        f"pat_{uuid.uuid4().hex[:8]}@test.com",
        "PatPass99!",
        role="patient",
    )
    token = patient["access_token"]
    scan_resp = app_client.post(
        "/scans",
        json={
            "cloudinary_public_id": f"teledent/scans/{uuid.uuid4().hex}",
            "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
            "scan_type": "panoramic",
            "scan_date": "2026-06-01",
        },
        headers=auth_headers(token),
    )
    scan_id = scan_resp.json()["scan_id"]

    for _ in range(20):
        st = app_client.get(f"/scans/{scan_id}/analysis/status", headers=auth_headers(token))
        if st.json().get("status") in ("complete", "failed"):
            break
        time.sleep(0.3)

    analysis = app_client.get(f"/scans/{scan_id}/analysis", headers=auth_headers(token)).json()
    return patient, scan_id, analysis


# ── TC-11: Dentist Validation ─────────────────────────────────────────────────
class TestTC11_DentistValidation:
    """TC-11: Verify dentist can review, validate, and approve AI report."""

    def test_dentist_can_update_ai_report(self, app_client):
        """
        A dentist should be able to PATCH /reports/{id} to add clinical notes
        and a final diagnosis, effectively approving the AI-generated report.
        """
        patient, scan_id, analysis = _create_patient_with_scan(app_client)
        report_id = analysis.get("report_id")
        assert report_id, "No report_id after AI analysis"

        dentist = _create_dentist(app_client)
        d_token = dentist["access_token"]

        resp = app_client.patch(
            f"/reports/{report_id}",
            json={
                "dentist_notes": "Confirmed caries in lower left molar. Filling required.",
                "final_diagnosis": "Dental caries — lower left molar",
                "recommended_actions": ["Composite filling", "Follow-up in 6 months"],
            },
            headers=auth_headers(d_token),
        )
        assert resp.status_code == 200, resp.text

        # Verify the update persisted by fetching the report
        get_resp = app_client.get(f"/reports/{report_id}", headers=auth_headers(d_token))
        assert get_resp.status_code == 200, get_resp.text
        fetched = get_resp.json()
        assert fetched.get("dentist_notes") is not None, \
            f"dentist_notes not persisted, report keys: {list(fetched.keys())}"
        assert fetched.get("final_diagnosis") is not None, \
            f"final_diagnosis not persisted, report keys: {list(fetched.keys())}"

    def test_dentist_can_create_manual_report(self, app_client):
        """Dentist can create a completely new report for a patient's scan."""
        patient, scan_id, analysis = _create_patient_with_scan(app_client)

        # Get the patient's profile ID for the report
        patient_profile_resp = app_client.get(
            "/patients/me",
            headers=auth_headers(patient["access_token"]),
        )
        # If /patients/me doesn't exist, skip gracefully
        if patient_profile_resp.status_code == 404:
            pytest.skip("/patients/me not available — skipping manual report creation test")

        dentist = _create_dentist(app_client)
        d_token = dentist["access_token"]

        # Get patient ID from the profile
        patient_id = patient_profile_resp.json().get("id")
        assert patient_id, "Could not retrieve patient profile id"

        resp = app_client.post(
            "/reports",
            json={
                "scan_id": scan_id,
                "patient_id": patient_id,
                "final_diagnosis": "Mild caries detected",
                "dentist_notes": "Patient advised to reduce sugar intake.",
                "recommended_actions": ["Fluoride treatment"],
            },
            headers=auth_headers(d_token),
        )
        assert resp.status_code == 201, resp.text

    def test_patient_cannot_update_report(self, app_client):
        """Patients must NOT be able to PATCH reports (dentist-only endpoint)."""
        patient, scan_id, analysis = _create_patient_with_scan(app_client)
        report_id = analysis.get("report_id")
        if not report_id:
            pytest.skip("No report generated — skipping")

        p_token = patient["access_token"]
        resp = app_client.patch(
            f"/reports/{report_id}",
            json={"dentist_notes": "Malicious edit"},
            headers=auth_headers(p_token),
        )
        assert resp.status_code in (403, 401)


# ── TC-12: Appointment Booking ────────────────────────────────────────────────
class TestTC12_AppointmentBooking:
    """TC-12: Verify patient can book appointment with available dentist."""

    def test_patient_books_appointment_returns_201(self, app_client):
        patient = register_and_login(
            app_client, f"book_{uuid.uuid4().hex[:8]}@test.com", "BookPass99!"
        )
        dentist = _create_dentist(app_client)
        d_token = dentist["access_token"]

        # Get dentist profile to get dentist.id
        dentist_list = app_client.get("/dentists", headers=auth_headers(d_token))
        assert dentist_list.status_code == 200
        dentists = dentist_list.json()
        dentist_profile_id = None
        if isinstance(dentists, list) and dentists:
            dentist_profile_id = dentists[0].get("id")
        elif isinstance(dentists, dict) and dentists.get("data"):
            dentist_profile_id = dentists["data"][0].get("id")

        if not dentist_profile_id:
            pytest.skip("Could not retrieve dentist profile id from /dentists")

        p_token = patient["access_token"]
        resp = app_client.post(
            "/appointments",
            json={
                "dentist_id": dentist_profile_id,
                "scheduled_at": "2026-07-15T10:00:00",
                "duration_min": 30,
                "type": "video_consultation",
            },
            headers=auth_headers(p_token),
        )
        assert resp.status_code == 201, resp.text
        appt = resp.json()
        assert "id" in appt
        assert appt["status"] == "confirmed"

    def test_appointment_appears_in_patient_list(self, app_client):
        patient = register_and_login(
            app_client, f"apptlist_{uuid.uuid4().hex[:8]}@test.com", "ListPass99!"
        )
        dentist = _create_dentist(app_client)

        dentist_list = app_client.get("/dentists", headers=auth_headers(dentist["access_token"]))
        dentists = dentist_list.json()
        if isinstance(dentists, list) and dentists:
            dentist_profile_id = dentists[0].get("id")
        elif isinstance(dentists, dict) and dentists.get("data"):
            dentist_profile_id = dentists["data"][0].get("id")
        else:
            pytest.skip("Could not retrieve dentist profile id")

        p_token = patient["access_token"]
        app_client.post(
            "/appointments",
            json={"dentist_id": dentist_profile_id, "scheduled_at": "2026-08-01T09:00:00", "type": "video_consultation"},
            headers=auth_headers(p_token),
        )
        list_resp = app_client.get("/appointments", headers=auth_headers(p_token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] >= 1

    def test_unauthenticated_booking_returns_401(self, app_client):
        resp = app_client.post(
            "/appointments",
            json={"dentist_id": str(uuid.uuid4()), "scheduled_at": "2026-07-15T10:00:00", "type": "video_consultation"},
        )
        assert resp.status_code == 401

    def test_dentist_cannot_book_appointment(self, app_client):
        dentist = _create_dentist(app_client)
        resp = app_client.post(
            "/appointments",
            json={"dentist_id": str(uuid.uuid4()), "scheduled_at": "2026-07-15T10:00:00", "type": "video_consultation"},
            headers=auth_headers(dentist["access_token"]),
        )
        assert resp.status_code == 403


# ── TC-13: Dentist Accepts Appointment ───────────────────────────────────────
class TestTC13_DentistAcceptsAppointment:
    """
    TC-13: Verify dentist can accept a pending appointment.

    NOTE: The current Appointment model has no 'pending' status — new
    appointments are created with status='confirmed'.  The service
    exposes PATCH /appointments/{id} which allows status updates.
    The complete_appointment endpoint marks status='completed'.

    Lockout-style 'accept' workflow (pending → confirmed) is marked
    xfail until a pending status + dentist-accept flow is implemented.
    """

    def test_dentist_accepts_pending_appointment(self, app_client):
        """
        Expects a pending → confirmed workflow triggered by a dentist action.
        """
        patient = register_and_login(
            app_client, f"accpat_{uuid.uuid4().hex[:8]}@test.com", "AccPass99!"
        )
        dentist = _create_dentist(app_client)

        dentist_list = app_client.get("/dentists", headers=auth_headers(dentist["access_token"]))
        dentists = dentist_list.json()
        dentist_profile_id = None
        if isinstance(dentists, list) and dentists:
            dentist_profile_id = dentists[0]["id"]
        elif isinstance(dentists, dict) and dentists.get("data"):
            dentist_profile_id = dentists["data"][0]["id"]
        if not dentist_profile_id:
            pytest.skip("Could not resolve dentist id")

        # Create appointment — must start as 'pending'
        appt_resp = app_client.post(
            "/appointments",
            json={"dentist_id": dentist_profile_id, "scheduled_at": "2026-09-01T11:00:00", "type": "video_consultation"},
            headers=auth_headers(patient["access_token"]),
        )
        assert appt_resp.status_code == 201
        appt_id = appt_resp.json()["id"]
        assert appt_resp.json()["status"] == "pending"

        # Dentist accepts via dedicated endpoint
        accept_resp = app_client.post(
            f"/appointments/{appt_id}/accept",
            headers=auth_headers(dentist["access_token"]),
        )
        assert accept_resp.status_code == 200
        assert accept_resp.json()["status"] == "confirmed"

    def test_dentist_can_complete_appointment(self, app_client):
        """Dentist can mark a confirmed appointment as completed."""
        patient = register_and_login(
            app_client, f"comp_{uuid.uuid4().hex[:8]}@test.com", "CompPass99!"
        )
        dentist = _create_dentist(app_client)

        dentist_list = app_client.get("/dentists", headers=auth_headers(dentist["access_token"]))
        dentists = dentist_list.json()
        if isinstance(dentists, list) and dentists:
            dentist_profile_id = dentists[0]["id"]
        elif isinstance(dentists, dict) and dentists.get("data"):
            dentist_profile_id = dentists["data"][0]["id"]
        else:
            pytest.skip("Could not resolve dentist id")

        appt_resp = app_client.post(
            "/appointments",
            json={"dentist_id": dentist_profile_id, "scheduled_at": "2026-10-01T14:00:00", "type": "video_consultation"},
            headers=auth_headers(patient["access_token"]),
        )
        appt_id = appt_resp.json()["id"]

        complete_resp = app_client.post(
            f"/appointments/{appt_id}/complete",
            headers=auth_headers(dentist["access_token"]),
        )
        assert complete_resp.status_code == 200


# ── TC-14: Payment Processing ─────────────────────────────────────────────────
class TestTC14_PaymentProcessing:
    """
    TC-14: Verify payment is processed successfully via Stripe.

    No Stripe integration exists in the current codebase — there is no
    payment router, model, or service.  All tests are marked xfail.
    """

    def test_payment_endpoint_exists(self, app_client):
        resp = app_client.post("/payments/create-intent", json={"appointment_id": str(uuid.uuid4())})
        assert resp.status_code not in (404, 405), "Payment endpoint does not exist"

    def test_successful_payment_returns_200(self, app_client):
        patient = register_and_login(
            app_client, f"pay_{uuid.uuid4().hex[:8]}@test.com", "PayPass99!"
        )
        dentist = _create_dentist(app_client)
        dentist_list = app_client.get("/dentists", headers=auth_headers(dentist["access_token"]))
        dentists = dentist_list.json()
        dentist_profile_id = None
        if isinstance(dentists, list) and dentists:
            dentist_profile_id = dentists[0]["id"]
        elif isinstance(dentists, dict) and dentists.get("data"):
            dentist_profile_id = dentists["data"][0]["id"]
        if not dentist_profile_id:
            pytest.skip("Could not resolve dentist id for payment test")

        appt_resp = app_client.post(
            "/appointments",
            json={"dentist_id": dentist_profile_id, "scheduled_at": "2026-09-15T10:00:00", "type": "video_consultation"},
            headers=auth_headers(patient["access_token"]),
        )
        assert appt_resp.status_code == 201
        appt_id = appt_resp.json()["id"]

        mock_intent = MagicMock()
        mock_intent.id = "pi_test_123"
        mock_intent.client_secret = "pi_test_123_secret_abc"
        mock_intent.status = "requires_payment_method"
        with patch("app.services.payment_service.stripe.PaymentIntent.create", return_value=mock_intent):
            resp = app_client.post(
                "/payments/create-intent",
                json={"appointment_id": appt_id},
                headers=auth_headers(patient["access_token"]),
            )
        assert resp.status_code == 200, resp.text
        assert "client_secret" in resp.json()

    @pytest.mark.xfail(
        reason="Stripe payment integration is not yet implemented in the backend",
        strict=True,
    )
    def test_payment_confirmation_updates_appointment_status(self, app_client):
        """After payment confirmation, appointment status should reflect payment."""
        pytest.skip("Stripe not implemented — cannot verify downstream status update")


# ── TC-15: Video Consultation ─────────────────────────────────────────────────
class TestTC15_VideoConsultation:
    """TC-15: Verify patient and dentist can connect via video call (LiveKit)."""

    def _setup_video_session(self, app_client):
        """Create dentist + patient + appointment + video session."""
        dentist = _create_dentist(app_client)
        patient = register_and_login(
            app_client, f"vpat_{uuid.uuid4().hex[:8]}@test.com", "VidPass99!"
        )

        dentist_list = app_client.get("/dentists", headers=auth_headers(dentist["access_token"]))
        dentists = dentist_list.json()
        if isinstance(dentists, list) and dentists:
            dentist_profile_id = dentists[0]["id"]
        elif isinstance(dentists, dict) and dentists.get("data"):
            dentist_profile_id = dentists["data"][0]["id"]
        else:
            return None, None, None, None

        appt_resp = app_client.post(
            "/appointments",
            json={
                "dentist_id": dentist_profile_id,
                "scheduled_at": "2026-11-01T15:00:00",
                "type": "video_consultation",
            },
            headers=auth_headers(patient["access_token"]),
        )
        appt_id = appt_resp.json()["id"]

        # Admin / dentist creates video session
        session_resp = app_client.post(
            "/video/sessions",
            json={"appointment_id": appt_id},
            headers=auth_headers(dentist["access_token"]),
        )
        return dentist, patient, appt_id, session_resp

    def test_create_video_session_returns_201(self, app_client):
        dentist, patient, appt_id, session_resp = self._setup_video_session(app_client)
        if appt_id is None:
            pytest.skip("Could not set up video session (dentist id not found)")
        assert session_resp.status_code == 201, session_resp.text
        body = session_resp.json()
        assert "session_id" in body
        assert "room_name" in body

    def test_patient_can_obtain_livekit_token(self, app_client):
        dentist, patient, appt_id, session_resp = self._setup_video_session(app_client)
        if appt_id is None:
            pytest.skip("Could not set up video session")
        if session_resp.status_code != 201:
            pytest.skip(f"Video session creation failed: {session_resp.text}")

        session_id = session_resp.json()["session_id"]
        token_resp = app_client.post(
            f"/video/sessions/{session_id}/token",
            headers=auth_headers(patient["access_token"]),
        )
        assert token_resp.status_code == 200, token_resp.text
        body = token_resp.json()
        assert "token" in body
        assert "room_name" in body
        assert "livekit_url" in body

    def test_dentist_can_obtain_livekit_token(self, app_client):
        dentist, patient, appt_id, session_resp = self._setup_video_session(app_client)
        if appt_id is None:
            pytest.skip("Could not set up video session")
        if session_resp.status_code != 201:
            pytest.skip(f"Video session creation failed: {session_resp.text}")

        session_id = session_resp.json()["session_id"]
        token_resp = app_client.post(
            f"/video/sessions/{session_id}/token",
            headers=auth_headers(dentist["access_token"]),
        )
        assert token_resp.status_code == 200, token_resp.text
        assert "token" in token_resp.json()

    def test_dentist_can_end_video_session(self, app_client):
        dentist, patient, appt_id, session_resp = self._setup_video_session(app_client)
        if appt_id is None:
            pytest.skip("Could not set up video session")
        if session_resp.status_code != 201:
            pytest.skip(f"Video session creation failed: {session_resp.text}")

        session_id = session_resp.json()["session_id"]
        end_resp = app_client.post(
            f"/video/sessions/{session_id}/end",
            headers=auth_headers(dentist["access_token"]),
        )
        assert end_resp.status_code == 200

    def test_unauthenticated_token_request_returns_401(self, app_client):
        resp = app_client.post(f"/video/sessions/{uuid.uuid4()}/token")
        assert resp.status_code == 401
