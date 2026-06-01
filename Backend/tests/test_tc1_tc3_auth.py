"""
TC-1  User Registration
TC-2  User Login
TC-3  Invalid Login Attempts — Security Lockout
"""
import uuid
import pytest
from tests.conftest import register_and_login, auth_headers


# ── TC-1: User Registration ───────────────────────────────────────────────────
class TestTC1_UserRegistration:
    """TC-1: Verify new patient can successfully register with valid information."""

    def test_register_returns_201(self, app_client):
        email = f"patient_{uuid.uuid4().hex[:8]}@test.com"
        resp = app_client.post("/auth/register", json={
            "email": email,
            "password": "SecurePass123!",
            "first_name": "Alice",
            "last_name": "Smith",
            "role": "patient",
        })
        assert resp.status_code == 201, resp.text

    def test_register_response_contains_tokens_and_user(self, app_client):
        email = f"patient_{uuid.uuid4().hex[:8]}@test.com"
        resp = app_client.post("/auth/register", json={
            "email": email,
            "password": "SecurePass123!",
            "first_name": "Bob",
            "last_name": "Jones",
            "role": "patient",
        })
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "patient"

    def test_register_duplicate_email_returns_409(self, app_client):
        email = f"dup_{uuid.uuid4().hex[:8]}@test.com"
        payload = {"email": email, "password": "Pass123!", "first_name": "A", "last_name": "B", "role": "patient"}
        app_client.post("/auth/register", json=payload)
        resp = app_client.post("/auth/register", json=payload)
        assert resp.status_code == 409

    def test_register_invalid_email_returns_422(self, app_client):
        resp = app_client.post("/auth/register", json={
            "email": "not-an-email",
            "password": "Pass123!",
            "first_name": "X",
            "last_name": "Y",
            "role": "patient",
        })
        assert resp.status_code == 422

    def test_register_missing_required_fields_returns_422(self, app_client):
        resp = app_client.post("/auth/register", json={"email": "x@x.com"})
        assert resp.status_code == 422


# ── TC-2: User Login ──────────────────────────────────────────────────────────
class TestTC2_UserLogin:
    """TC-2: Verify registered user can login with correct credentials."""

    def test_login_returns_200_with_tokens(self, app_client):
        email = f"login_{uuid.uuid4().hex[:8]}@test.com"
        password = "LoginPass99!"
        app_client.post("/auth/register", json={
            "email": email, "password": password,
            "first_name": "C", "last_name": "D", "role": "patient",
        })
        resp = app_client.post("/auth/login", json={"email": email, "password": password})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_login_response_contains_user_info(self, app_client):
        email = f"logininfo_{uuid.uuid4().hex[:8]}@test.com"
        password = "Pass12345!"
        app_client.post("/auth/register", json={
            "email": email, "password": password,
            "first_name": "Eve", "last_name": "Fox", "role": "patient",
        })
        resp = app_client.post("/auth/login", json={"email": email, "password": password})
        data = resp.json()
        assert data["user"]["email"] == email
        assert "expires_in" in data

    def test_authenticated_me_endpoint_works(self, app_client):
        email = f"me_{uuid.uuid4().hex[:8]}@test.com"
        password = "MePass99!"
        reg = register_and_login(app_client, email, password)
        token = reg["access_token"]
        resp = app_client.get("/auth/me", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["email"] == email

    def test_login_wrong_password_returns_401(self, app_client):
        email = f"wrong_{uuid.uuid4().hex[:8]}@test.com"
        app_client.post("/auth/register", json={
            "email": email, "password": "RightPass1!",
            "first_name": "G", "last_name": "H", "role": "patient",
        })
        resp = app_client.post("/auth/login", json={"email": email, "password": "WrongPass999!"})
        assert resp.status_code == 401

    def test_login_nonexistent_user_returns_401(self, app_client):
        resp = app_client.post("/auth/login", json={
            "email": "nobody@nowhere.com",
            "password": "DoesNotMatter1!",
        })
        assert resp.status_code == 401

    def test_protected_endpoint_without_token_returns_401(self, app_client):
        resp = app_client.get("/auth/me")
        assert resp.status_code == 401


# ── TC-3: Invalid Login Attempts — Security Lockout ──────────────────────────
class TestTC3_SecurityLockout:
    """
    TC-3: Verify account locks after 5 failed login attempts.

    NOTE: The current auth_service.login_user does NOT yet implement
    a failed-attempt counter or account lockout mechanism.
    This test suite documents the EXPECTED behaviour and marks
    the lockout assertion as xfail until the feature is implemented.
    """

    def test_five_consecutive_wrong_passwords_each_return_401(self, app_client):
        """Each failed attempt must return 401 (not 500)."""
        email = f"locktest_{uuid.uuid4().hex[:8]}@test.com"
        app_client.post("/auth/register", json={
            "email": email, "password": "Correct1!",
            "first_name": "L", "last_name": "K", "role": "patient",
        })
        for attempt in range(5):
            resp = app_client.post("/auth/login", json={"email": email, "password": "WrongPass!"})
            assert resp.status_code == 401, f"Attempt {attempt + 1} did not return 401"

    @pytest.mark.xfail(
        reason="Account lockout after 5 failed attempts is not yet implemented in auth_service.login_user",
        strict=True,
    )
    def test_account_locked_after_five_failed_attempts(self, app_client):
        """
        After 5 failed attempts the 6th attempt (even with correct password)
        should return 423 Locked or 401 with a lockout message.
        EXPECTED to fail until lockout logic is added.
        """
        email = f"lockout_{uuid.uuid4().hex[:8]}@test.com"
        correct_password = "Correct1!"
        app_client.post("/auth/register", json={
            "email": email, "password": correct_password,
            "first_name": "M", "last_name": "N", "role": "patient",
        })
        for _ in range(5):
            app_client.post("/auth/login", json={"email": email, "password": "BadPass!"})

        # After lockout, even the correct password should be rejected
        resp = app_client.post("/auth/login", json={"email": email, "password": correct_password})
        assert resp.status_code in (423, 401)
        body = resp.json()
        assert any(word in str(body).lower() for word in ("lock", "block", "attempt", "suspended"))
