"""Task 6 proof: demonstrates session_start_latency_ms emitted by 3 real sessions."""
import sys, uuid
sys.path.insert(0, '/app')
import os; os.chdir('/app')

from fastapi.testclient import TestClient
from app.main import app
from app.api import deps
from app.core.database import SessionLocal
from app.core.metrics import export_prometheus_text
from app.models.user import User
from app.models.meet_request import MeetRequest, RequestStatus

# Seed users and pre-accepted requests
db = SessionLocal()
uids = [uuid.uuid4() for _ in range(6)]
req_ids = []
for i, uid in enumerate(uids):
    db.add(User(id=uid, email=f'evrun2_{i}@proof.dev'))
db.flush()
for i in range(3):
    s, r = uids[i*2], uids[i*2+1]
    req = MeetRequest(requester_id=s, receiver_id=r, status=RequestStatus.ACCEPTED)
    db.add(req)
    db.flush()
    req_ids.append(str(req.id))
db.commit()
db.close()

_idx = [0]
def override():
    db2 = SessionLocal()
    u = db2.query(User).filter(User.id == uids[_idx[0]]).first()
    db2.close()
    return u

app.dependency_overrides[deps.get_current_user] = override
client = TestClient(app)

print("=== BEFORE ===")
before = export_prometheus_text()
print(before if before.strip() else "(empty — no sessions yet in this process)")
print()

for i in range(3):
    _idx[0] = i * 2
    r = client.post(f'/api/v1/sessions/from-request/{req_ids[i]}')
    print(f"Session {i+1}: HTTP {r.status_code}  {r.json()}")

app.dependency_overrides.clear()

print()
print("=== AFTER (3 sessions created — session_start_latency_ms incremented) ===")
print(export_prometheus_text())
