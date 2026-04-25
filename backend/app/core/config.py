from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    ANALYTICS_ENABLED: bool = True
    PROJECT_NAME: str = "MeetUp API"

    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")


settings = Settings()
