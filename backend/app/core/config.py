from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://command_center:command_center@localhost:5432/command_center"
    storage_dir: Path = Path("storage")
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cookie_secure: bool = False
    session_hours: int = 12
    max_upload_mb: int = 10
    max_rows: int = 50000
    max_columns: int = 100


settings = Settings()
