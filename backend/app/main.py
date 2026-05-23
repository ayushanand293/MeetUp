import logging
import time
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.api import api_router
from app.api.deps import get_db
from app.core.config import settings
from app.core.redis import get_redis

# Structured Logging Configuration
logging.basicConfig(
    level=logging.INFO if settings.ENVIRONMENT == "production" else logging.DEBUG,
    format='{"timestamp": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}',
)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")

# Production CORS - strict allowlist
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


@app.get("/health", tags=["monitoring"])
def health_check():
    """Simple shallow health check for load balancers."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/ready", tags=["monitoring"])
async def readiness_check(db: Session = Depends(get_db)):
    """Deep readiness check for deployment orchestration."""
    checks = {"status": "ok", "components": {}}
    
    # 1. Database Check
    try:
        db.execute(text("SELECT 1"))
        checks["components"]["database"] = "ok"
    except Exception as e:
        logger.error(f"Readiness check failed: Database unreachable: {str(e)}")
        checks["status"] = "fail"
        checks["components"]["database"] = "error"
        
    # 2. Redis Check
    try:
        redis_client = await get_redis()
        await redis_client.ping()
        checks["components"]["redis"] = "ok"
    except Exception as e:
        logger.error(f"Readiness check failed: Redis unreachable: {str(e)}")
        checks["status"] = "fail"
        checks["components"]["redis"] = "error"
        
    return checks


app.include_router(api_router, prefix="/api/v1")
