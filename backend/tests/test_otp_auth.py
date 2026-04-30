import hashlib
import uuid

from fastapi.testclient import TestClient

from app.main import app


def _otp_hash(phone_hash_value: str, otp_code: str) -> str:
    return hashlib.sha256(f"{phone_hash_value}:{otp_code}".encode("utf-8")).hexdigest()


def test_otp_start_and_verify_success(monkeypatch):
    client = TestClient(app)
    phone = "+15551234567"

    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: 123456)

    start = client.post("/api/v1/auth/otp/start", json={"phone_e164": phone})
    assert start.status_code == 200, start.text
    assert start.json()["ok"] is True
    assert start.json()["expires_in_seconds"] == 300

    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": "123456", "device_id": "ios-dev-1"},
    )
    assert verify.status_code == 200, verify.text
    payload = verify.json()
    assert payload["access_token"]
    assert payload["user"]["phone_e164"] == phone


def test_otp_verify_wrong_code_fails(monkeypatch):
    client = TestClient(app)
    phone = "+15551230000"

    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: 111111)

    start = client.post("/api/v1/auth/otp/start", json={"phone_e164": phone})
    assert start.status_code == 200, start.text

    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": "222222", "device_id": "android-dev-1"},
    )
    assert verify.status_code == 401, verify.text


def test_otp_start_rate_limited(monkeypatch):
    client = TestClient(app)
    phone = f"+1555{str(uuid.uuid4().int)[-7:]}"

    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: 654321)

    # limit is 5 per minute for the same phone
    for i in range(6):
        resp = client.post("/api/v1/auth/otp/start", json={"phone_e164": phone})
        if i < 5:
            assert resp.status_code == 200, resp.text
        else:
            assert resp.status_code == 429, resp.text


def test_profile_update_optional_email(monkeypatch):
    client = TestClient(app)
    phone = "+15551239999"

    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: 777777)
    assert client.post("/api/v1/auth/otp/start", json={"phone_e164": phone}).status_code == 200

    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": "777777", "device_id": "ios-dev-2"},
    )
    assert verify.status_code == 200, verify.text
    token = verify.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    update_1 = client.post(
        "/api/v1/users/profile",
        headers=headers,
        json={"display_name": "Ayu", "email": "ayu@example.com"},
    )
    assert update_1.status_code == 200, update_1.text
    assert update_1.json()["email"] == "ayu@example.com"

    update_2 = client.post(
        "/api/v1/users/profile",
        headers=headers,
        json={"display_name": "Ayu", "email": ""},
    )
    assert update_2.status_code == 200, update_2.text
    assert update_2.json()["email"] is None


def test_second_otp_login_invalidates_first_device(monkeypatch):
    client = TestClient(app)
    phone = "+15551238888"

    codes = iter([111111, 222222])
    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: next(codes))

    assert client.post("/api/v1/auth/otp/start", json={"phone_e164": phone}).status_code == 200
    first_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": "111111", "device_id": "ios-dev-old"},
    )
    assert first_verify.status_code == 200, first_verify.text
    first_token = first_verify.json()["access_token"]

    assert client.post("/api/v1/auth/otp/start", json={"phone_e164": phone}).status_code == 200
    second_verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": "222222", "device_id": "ios-dev-new"},
    )
    assert second_verify.status_code == 200, second_verify.text
    second_token = second_verify.json()["access_token"]

    first_headers = {"Authorization": f"Bearer {first_token}"}
    second_headers = {"Authorization": f"Bearer {second_token}"}

    old_session = client.get("/api/v1/users/me", headers=first_headers)
    assert old_session.status_code == 401, old_session.text
    assert old_session.json()["detail"] == "Session invalidated"

    current_session = client.get("/api/v1/users/me", headers=second_headers)
    assert current_session.status_code == 200, current_session.text
    assert current_session.json()["phone_e164"] == phone


def test_otp_dev_echo_only_in_non_production(monkeypatch):
    client = TestClient(app)
    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: 123456)

    from app.core.config import settings

    original_echo = settings.OTP_DEV_ECHO_ENABLED
    original_env = settings.ENVIRONMENT
    try:
        settings.OTP_DEV_ECHO_ENABLED = False
        settings.ENVIRONMENT = "development"
        resp = client.post("/api/v1/auth/otp/start", json={"phone_e164": "+15554440001"})
        assert resp.status_code == 200, resp.text
        assert "dev_otp_code" not in resp.json()

        settings.OTP_DEV_ECHO_ENABLED = True
        settings.ENVIRONMENT = "development"
        resp = client.post("/api/v1/auth/otp/start", json={"phone_e164": "+15554440002"})
        assert resp.status_code == 200, resp.text
        assert resp.json().get("dev_otp_code") == "123456"

        settings.ENVIRONMENT = "production"
        resp = client.post("/api/v1/auth/otp/start", json={"phone_e164": "+15554440003"})
        assert resp.status_code == 200, resp.text
        assert "dev_otp_code" not in resp.json()
    finally:
        settings.OTP_DEV_ECHO_ENABLED = original_echo
        settings.ENVIRONMENT = original_env
