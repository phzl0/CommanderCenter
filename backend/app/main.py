from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from app.core.db import get_db
from app.core.config import settings
from app.modules import (
    auth,
    management,
    files,
    reports,
    intelligence,
    notifications,
    newsroom,
    integrations,
)

app = FastAPI(title="Command Center", version="0.4.0")
app.include_router(auth.router)
app.include_router(management.router)
app.include_router(files.router)
app.include_router(reports.router)
app.include_router(intelligence.router)
app.include_router(notifications.router)
app.include_router(newsroom.router)
app.include_router(integrations.router)


@app.middleware("http")
async def browser_security(request: Request, call_next):
    if request.url.path == "/api/imports" and request.method == "POST":
        length = request.headers.get("content-length")
        if length and (
            not length.isdigit()
            or int(length) > (settings.max_upload_mb + 1) * 1024 * 1024
        ):
            return JSONResponse(
                {"detail": "Arquivo excede o tamanho permitido."}, status_code=413
            )
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origins = [o.strip() for o in settings.allowed_origins.split(",")]
        if request.headers.get("origin") not in origins:
            return JSONResponse({"detail": "Origem não permitida."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@app.exception_handler(OperationalError)
async def database_unavailable(request: Request, exc: OperationalError):
    return JSONResponse(
        {"detail": "Banco indisponível. Confira se o PostgreSQL está em execução."},
        status_code=503,
    )
