from fastapi import FastAPI, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.modules import auth

app = FastAPI(title="Command Center", version="0.1.0")
app.include_router(auth.router)

@app.middleware("http")
async def browser_security(request: Request, call_next):
    if request.method in {"POST","PUT","PATCH","DELETE"}:
        origins = [o.strip() for o in settings.allowed_origins.split(",")]
        if request.headers.get("origin") not in origins:
            return JSONResponse({"detail":"Origem não permitida."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status":"ok", "database":"ok"}
