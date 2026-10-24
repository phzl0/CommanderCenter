#!/bin/sh
set -eu
python - <<'PY'
import time
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from app.core.db import engine
for attempt in range(60):
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
        break
    except OperationalError:
        if attempt == 59:
            raise SystemExit('PostgreSQL indisponível após 60 tentativas.')
        time.sleep(1)
PY
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
