from fastapi import APIRouter

from app.api.endpoints import requests, sessions, users

api_router = APIRouter()
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(requests.router, prefix="/requests", tags=["requests"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
