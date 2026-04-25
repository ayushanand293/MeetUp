from fastapi import APIRouter

from app.api.endpoints import auth, invites, metrics, realtime, requests, sessions, users

api_router = APIRouter()
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(requests.router, prefix="/requests", tags=["requests"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(invites.router, prefix="/invites", tags=["invites"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(realtime.router, prefix="/ws", tags=["realtime"])
api_router.include_router(metrics.router, prefix="", tags=["monitoring"])
