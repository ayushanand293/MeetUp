from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import api_router
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")

# Production CORS - strict allowlist
# Use settings.CORS_ORIGINS if configured, otherwise default to safe local origins.
# If ENVIRONMENT is development and CORS_ORIGINS is empty, we allow * for ease of use.
origins = settings.CORS_ORIGINS
if not origins:
    if settings.ENVIRONMENT == "development":
        origins = ["*"]
    else:
        origins = [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:8081",
        ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Welcome to MeetUp API"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(api_router, prefix="/api/v1")
