from fastapi import APIRouter

from app.api.endpoints import realtime, requests, sessions, users, metrics

api_router = APIRouter()
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(requests.router, prefix="/requests", tags=["requests"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(realtime.router, prefix="/ws", tags=["realtime"])
api_router.include_router(metrics.router, prefix="", tags=["monitoring"])
