from datetime import datetime
from uuid import UUID

from app.core.database import SessionLocal
from app.models.session import SessionStatus
from app.models.session import Session as MeetSession


def end_session_sync(session_id: UUID, reason: str) -> bool:
    """
    Synchronously safely update session status to ENDED.
    Designed to be run via `run_in_threadpool` from async contexts.
    Returns True if successfully ended by this call, False otherwise.
    """
    db = SessionLocal()
    try:
        session = db.query(MeetSession).filter(MeetSession.id == session_id).first()
        if session and session.status == SessionStatus.ACTIVE:
            session.status = SessionStatus.ENDED
            session.end_reason = reason
            session.ended_at = datetime.utcnow()
            db.commit()
            return True
        return False
    finally:
        db.close()
