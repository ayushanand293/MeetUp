import hashlib

from fastapi.testclient import TestClient

from app.main import app


def _digest(phone: str, version: int = 1) -> str:
    return hashlib.sha256(f"v{version}:{phone}".encode("utf-8")).hexdigest()


def _otp_login(client: TestClient, phone: str, code: str) -> str:
    start = client.post("/api/v1/auth/otp/start", json={"phone_e164": phone})
    assert start.status_code == 200, start.text
    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": code, "device_id": f"dev-{phone[-4:]}"},
    )
    assert verify.status_code == 200, verify.text
    return verify.json()["access_token"]


def test_contacts_match_requires_auth():
    client = TestClient(app)
    resp = client.post("/api/v1/contacts/match", json={"digests": [], "version": 1})
    assert resp.status_code == 401


def test_contacts_match_returns_only_matches(monkeypatch):
    client = TestClient(app)

    codes = iter([111111, 222222, 333333])
    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: next(codes))

    phone_a = "+15551110001"
    phone_b = "+15551110002"
    phone_c = "+15551110003"

    token_a = _otp_login(client, phone_a, "111111")
    _ = _otp_login(client, phone_b, "222222")
    _ = _otp_login(client, phone_c, "333333")

    headers = {"Authorization": f"Bearer {token_a}"}
    body = {
        "version": 1,
        "digests": [
            _digest(phone_a),
            _digest(phone_b),
            _digest("+15559990000"),
        ],
    }

    resp = client.post("/api/v1/contacts/match", json=body, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert len(data) == 1
    assert data[0]["phone_last4"] == "0002"
    assert data[0]["matched_digest"] == _digest(phone_b)
    assert all(item["phone_last4"] != "0001" for item in data)


def test_contacts_match_cap_and_rate_limit(monkeypatch):
    client = TestClient(app)

    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: 444444)
    phone = "+15552223333"
    token = _otp_login(client, phone, "444444")
    headers = {"Authorization": f"Bearer {token}"}

    too_many = ["a" * 64 for _ in range(501)]
    cap_resp = client.post(
        "/api/v1/contacts/match",
        json={"version": 1, "digests": too_many},
        headers=headers,
    )
    assert cap_resp.status_code == 400, cap_resp.text

    # limit is 30/min
    for i in range(31):
        resp = client.post(
            "/api/v1/contacts/match",
            json={"version": 1, "digests": []},
            headers=headers,
        )
        if i < 30:
            assert resp.status_code == 200, resp.text
        else:
            assert resp.status_code == 429, resp.text
