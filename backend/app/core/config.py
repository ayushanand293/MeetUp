from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    ANALYTICS_ENABLED: bool = True
    PROJECT_NAME: str = "MeetUp API"
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = []
    METRICS_BACKEND: str = "redis"
    AUTH_JWT_SECRET: str = ""
    AUTH_JWT_ALGORITHM: str = "HS256"
    AUTH_ACCESS_TOKEN_TTL_SECONDS: int = 86400
    OTP_TTL_SECONDS: int = 300
    OTP_DIGITS: int = 6
    OTP_START_LIMIT_PER_PHONE: int = 5
    OTP_START_LIMIT_PER_IP: int = 20
    OTP_VERIFY_LIMIT_PER_PHONE: int = 10
    OTP_VERIFY_LIMIT_PER_IP: int = 30
    OTP_DEV_ECHO_ENABLED: bool = False
    PHONE_HASH_PEPPER: str = "dev-pepper-change-me"
    CONTACTS_HASH_VERSION: int = 1
    CONTACTS_MATCH_MAX_DIGESTS: int = 500
    CONTACTS_MATCH_LIMIT_PER_MINUTE: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")


settings = Settings()
