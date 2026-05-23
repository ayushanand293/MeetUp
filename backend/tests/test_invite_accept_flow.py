from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.session import Session as MeetSession
from app.models.session import SessionParticipant


def _otp_login(client: TestClient, phone: str, code: str, device_id: str) -> str:
    start = client.post("/api/v1/auth/otp/start", json={"phone_e164": phone})
    assert start.status_code == 200, start.text
    verify = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone_e164": phone, "otp_code": code, "device_id": device_id},
    )
    assert verify.status_code == 200, verify.text
    return verify.json()["access_token"]


def test_invite_resolve_minimal_and_accept_creates_single_session(monkeypatch):
    client = TestClient(app)

    codes = iter([111111, 222222])
    monkeypatch.setattr("app.api.endpoints.auth.secrets.randbelow", lambda _: next(codes))

    requester_phone = "+15553330001"
    receiver_phone = "+15553330002"

    requester_token = _otp_login(client, requester_phone, "111111", "dev-rq")
    requester_headers = {"Authorization": f"Bearer {requester_token}"}

    create_invite = client.post(
        "/api/v1/invites",
        headers=requester_headers,
        json={
            "recipient": receiver_phone,
            "request_context": {"requester_id": "self"},
        },
    )
    # requester_id must be current user if provided, so create again without bad value
    assert create_invite.status_code == 403

    create_invite = client.post(
        "/api/v1/invites",
        headers=requester_headers,
        json={
            "recipient": receiver_phone,
        },
    )
    assert create_invite.status_code == 201, create_invite.text
    token = create_invite.json()["token"]

    resolved = client.get(f"/api/v1/invites/{token}")
    assert resolved.status_code == 200, resolved.text
    resolved_payload = resolved.json()
    assert "requester_name" in resolved_payload
    assert "recipient" not in resolved_payload
    assert "recipient_phone_e164" not in resolved_payload

    # Auth required for accept/redeem
    unauth = client.post(f"/api/v1/invites/{token}/redeem")
    assert unauth.status_code == 401

    receiver_token = _otp_login(client, receiver_phone, "222222", "dev-rx")
    receiver_headers = {"Authorization": f"Bearer {receiver_token}"}

    redeem_1 = client.post(f"/api/v1/invites/{token}/redeem", headers=receiver_headers)
    assert redeem_1.status_code == 200, redeem_1.text
    session_id = redeem_1.json()["session_id"]
    assert session_id

    redeem_2 = client.post(f"/api/v1/invites/{token}/redeem", headers=receiver_headers)
    assert redeem_2.status_code == 200, redeem_2.text
    assert redeem_2.json()["session_id"] == session_id

    db = SessionLocal()
    try:
        sessions = db.query(MeetSession).filter(MeetSession.id == session_id).all()
        assert len(sessions) == 1
        participants = db.query(SessionParticipant).filter(SessionParticipant.session_id == session_id).all()
        assert len(participants) == 2
    finally:
        db.close()
