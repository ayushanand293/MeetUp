from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api import api_router
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")

# Production CORS - strict allowlist in real prod, but permissive for dev/mobile flexibility
# In a real deployed env, default to specific domains
origins = [
    "http://localhost",
    "http://localhost:3000",  # Web
    "http://localhost:8081",  # Expo / Metro
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For now, allow all for mobile dev ease. Change to 'origins' before public deploy.
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
