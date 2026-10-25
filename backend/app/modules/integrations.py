"""Per-owner, read-only account integrations. OAuth secrets never reach the UI."""

import base64
import hashlib
import json
import os
import re
import secrets
import tempfile
from datetime import timedelta
from typing import Literal
from urllib.parse import urlencode, urlparse, quote
import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.db import get_db
from app.core.security import current_user, COOKIE, token_hash
from app.models import (
    User,
    IntegrationConnection,
    IntegrationFlow,
    DashboardWidget,
    now,
)
from app.modules import providers

router = APIRouter(prefix="/api/integrations", tags=["Conexões somente leitura"])
Provider = Literal["github", "microsoft"]


def cipher():
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    path = settings.storage_dir / ".integration-key"
    if not path.exists():
        with tempfile.NamedTemporaryFile(
            dir=settings.storage_dir, prefix=".key-", delete=False
        ) as file:
            temp = file.name
            file.write(Fernet.generate_key())
        try:
            try:
                os.link(temp, path)
            except FileExistsError:
                pass
        finally:
            os.unlink(temp)
    return Fernet(path.read_bytes())


def pack(data):
    return cipher().encrypt(json.dumps(data).encode()).decode()


def unpack(data):
    try:
        return json.loads(cipher().decrypt(data.encode()))
    except (InvalidToken, ValueError):
        raise providers.ProviderError(
            "Reconecte a conta: a chave local da integração mudou."
        )


def specification(provider):
    if provider == "github":
        return {
            "id": settings.github_client_id,
            "secret": settings.github_client_secret,
            "authorize": "https://github.com/login/oauth/authorize",
            "token": "https://github.com/login/oauth/access_token",
            "scope": "read:user",
        }
    if not re.fullmatch(
        r"organizations|common|[A-Za-z0-9.-]{1,100}", settings.microsoft_tenant
    ):
        raise HTTPException(503, "MICROSOFT_TENANT inválido na configuração local.")
    base = (
        "https://login.microsoftonline.com/"
        + settings.microsoft_tenant
        + "/oauth2/v2.0/"
    )
    return {
        "id": settings.microsoft_client_id,
        "secret": settings.microsoft_client_secret,
        "authorize": base + "authorize",
        "token": base + "token",
        "scope": "offline_access User.Read Tasks.Read",
    }


def callback_url(provider):
    origin = settings.integration_origin.rstrip("/")
    parsed = urlparse(origin)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.query
        or parsed.fragment
        or parsed.path
        or origin not in [o.strip() for o in settings.allowed_origins.split(",")]
    ):
        raise HTTPException(
            503,
            "INTEGRATION_ORIGIN deve ser uma origem permitida, sem caminho, como http://localhost:5173.",
        )
    return origin + f"/api/integrations/{provider}/callback"


def configured(provider):
    s = specification(provider)
    return bool(s["id"] and s["secret"])


def remote(method, url, *, data=None, token=None):
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname
        not in {
            "github.com",
            "api.github.com",
            "login.microsoftonline.com",
            "graph.microsoft.com",
        }
        or parsed.username
        or parsed.port not in (None, 443)
    ):
        raise providers.ProviderError("Endereço da integração inválido.")
    headers = {"Accept": "application/json", "User-Agent": "CommandCenter/0.4"}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            with client.stream(method, url, data=data, headers=headers) as response:
                if response.status_code in (401, 403):
                    raise providers.ProviderError(
                        "Reconecte a conta ou solicite a permissão de leitura ao administrador."
                    )
                if response.status_code == 429:
                    raise providers.ProviderError(
                        "Limite de consultas atingido. Tente novamente mais tarde."
                    )
                if response.status_code == 409:
                    return []
                if response.status_code != 200:
                    raise providers.ProviderError(
                        "O serviço não concluiu a consulta. Verifique as permissões e tente novamente."
                    )
                raw = bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw) > 3 * 1024 * 1024:
                        raise providers.ProviderError(
                            "A resposta excedeu o limite de leitura."
                        )
                result = json.loads(raw)
                if isinstance(result, dict) and result.get("error"):
                    raise providers.ProviderError(
                        "Não foi possível autorizar. Confira as credenciais e reconecte a conta."
                    )
                return result
    except providers.ProviderError:
        raise
    except Exception:
        raise providers.ProviderError(
            "A integração está indisponível. Tente novamente mais tarde."
        )


def connection(db, user, provider):
    return db.scalar(
        select(IntegrationConnection).where(
            IntegrationConnection.owner_id == user.id,
            IntegrationConnection.provider == provider,
        )
    )


def credentials(db, user, provider):
    row = connection(db, user, provider)
    if not row:
        raise providers.ProviderError(
            "Conecte sua conta neste painel para consultar seus dados."
        )
    data = unpack(row.credentials)
    if row.expires_at and row.expires_at < now() + timedelta(seconds=60):
        if not data.get("refresh_token"):
            raise providers.ProviderError("A autorização expirou. Reconecte a conta.")
        spec = specification(provider)
        fresh = remote(
            "POST",
            spec["token"],
            data={
                "client_id": spec["id"],
                "client_secret": spec["secret"],
                "grant_type": "refresh_token",
                "refresh_token": data["refresh_token"],
            },
        )
        data = {**data, **fresh}
        row.credentials = pack(data)
        row.expires_at = now() + timedelta(seconds=int(data.get("expires_in", 3600)))
        db.commit()
    return data["access_token"]


def invalidate(db, user, provider):
    kind = "github" if provider == "github" else "teams"
    for w in db.scalars(
        select(DashboardWidget).where(
            DashboardWidget.owner_id == user.id, DashboardWidget.kind == kind
        )
    ):
        w.cached_at = None
        w.cached_data = None


@router.get("")
def status(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {
        p: {
            "configured": configured(p),
            "connected": bool(r := connection(db, user, p)),
            "account": r.account if r else None,
            "callback_url": callback_url(p),
        }
        for p in ("github", "microsoft")
    }


@router.post("/{provider}/start")
def start(
    provider: Provider,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    spec = specification(provider)
    redirect = callback_url(provider)
    if request.headers.get("origin") != settings.integration_origin.rstrip("/"):
        raise HTTPException(
            409,
            "Para conectar, abra o Command Center em "
            + settings.integration_origin.rstrip("/")
            + " e entre novamente.",
        )
    if not configured(provider):
        raise HTTPException(
            409,
            "Configure o aplicativo de conexão no .env local. Consulte docs/connections.md no repositório.",
        )
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    db.execute(
        delete(IntegrationFlow).where(
            (IntegrationFlow.expires_at < now())
            | (
                (IntegrationFlow.owner_id == user.id)
                & (IntegrationFlow.provider == provider)
            )
        )
    )
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    db.add(
        IntegrationFlow(
            state_hash=token_hash(state),
            owner_id=user.id,
            session_hash=token_hash(request.cookies.get(COOKIE, "")),
            provider=provider,
            verifier=pack(verifier),
            expires_at=now() + timedelta(minutes=10),
        )
    )
    db.commit()
    params = {
        "client_id": spec["id"],
        "redirect_uri": redirect,
        "state": state,
        "scope": spec["scope"],
        "response_type": "code",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return {"url": spec["authorize"] + "?" + urlencode(params)}


@router.get("/{provider}/callback")
def callback(
    provider: Provider,
    request: Request,
    state: str = "",
    code: str = "",
    error: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    flow = db.scalar(
        select(IntegrationFlow)
        .where(IntegrationFlow.state_hash == token_hash(state))
        .with_for_update()
    )
    if (
        not flow
        or flow.owner_id != user.id
        or flow.provider != provider
        or flow.expires_at < now()
        or flow.session_hash != token_hash(request.cookies.get(COOKIE, ""))
    ):
        raise HTTPException(
            400, "Autorização inválida ou expirada. Inicie a conexão novamente."
        )
    verifier = unpack(flow.verifier)
    db.delete(flow)
    db.commit()
    outcome = "cancelled" if error or not code else "connected"
    if outcome == "connected":
        try:
            spec = specification(provider)
            data = remote(
                "POST",
                spec["token"],
                data={
                    "client_id": spec["id"],
                    "client_secret": spec["secret"],
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": callback_url(provider),
                    "code_verifier": verifier,
                },
            )
            access = data["access_token"]
            profile = remote(
                "GET",
                "https://api.github.com/user"
                if provider == "github"
                else "https://graph.microsoft.com/v1.0/me",
                token=access,
            )
            db.scalar(select(User).where(User.id == user.id).with_for_update())
            row = connection(db, user, provider)
            if not row:
                row = IntegrationConnection(owner_id=user.id, provider=provider)
                db.add(row)
            row.account = str(
                profile.get("login")
                or profile.get("userPrincipalName")
                or profile.get("displayName")
                or "Conta conectada"
            )[:200]
            row.credentials = pack(
                {k: data[k] for k in ("access_token", "refresh_token") if k in data}
            )
            row.expires_at = (
                now() + timedelta(seconds=int(data["expires_in"]))
                if data.get("expires_in")
                else None
            )
            invalidate(db, user, provider)
            db.commit()
        except (providers.ProviderError, KeyError, ValueError):
            db.rollback()
            outcome = "failed"
    return RedirectResponse(
        settings.integration_origin.rstrip("/") + "/#/connection/" + outcome,
        status_code=303,
    )


@router.delete("/{provider}", status_code=204)
def disconnect(
    provider: Provider,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    db.execute(
        delete(IntegrationConnection).where(
            IntegrationConnection.owner_id == user.id,
            IntegrationConnection.provider == provider,
        )
    )
    db.execute(
        delete(IntegrationFlow).where(
            IntegrationFlow.owner_id == user.id, IntegrationFlow.provider == provider
        )
    )
    invalidate(db, user, provider)
    db.commit()


@router.get("/github/repositories")
def repositories(
    page: int = 1, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    if not 1 <= page <= 20:
        raise HTTPException(422, "Página inválida.")
    try:
        token = credentials(db, user, "github")
        items = remote(
            "GET",
            f"https://api.github.com/user/repos?per_page=30&page={page}&sort=updated&visibility=public&affiliation=owner,collaborator,organization_member",
            token=token,
        )
        return {
            "items": [
                {
                    "name": r["full_name"],
                    "description": str(r.get("description") or "")[:200],
                }
                for r in items
            ],
            "has_more": len(items) == 30,
        }
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))


def github_panel(db, user, repository, start, end):
    if not connection(db, user, "github"):
        return providers.github_data(repository, start, end)
    token = credentials(db, user, "github")
    result = providers.github_data(
        repository, start, end, getter=lambda url: remote("GET", url, token=token)
    )
    result["message"] = (
        "Até 100 commits da branch padrão no período. Conexão de leitura para repositórios públicos."
    )
    return result


@router.get("/microsoft/lists")
def task_lists(db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        token = credentials(db, user, "microsoft")
        data = remote(
            "GET",
            "https://graph.microsoft.com/v1.0/me/todo/lists?$top=100",
            token=token,
        )
        return [
            {"id": r["id"], "name": r["displayName"]} for r in data.get("value", [])
        ]
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))


def task_panel(db, user, source, list_id):
    if not connection(db, user, "microsoft"):
        return {
            "status": "needs_config",
            "source": "Microsoft Planner / To Do",
            "message": "Conecte sua conta Microsoft para consultar tarefas. Nenhuma mensagem será acessada.",
        }
    token = credentials(db, user, "microsoft")
    if source == "todo" and not list_id:
        return {
            "status": "needs_config",
            "source": "Microsoft To Do",
            "message": "Selecione uma lista do To Do nas configurações do painel.",
        }
    path = (
        "me/planner/tasks?$top=100"
        if source == "planner"
        else "me/todo/lists/" + quote(list_id, safe="") + "/tasks?$top=100"
    )
    data = remote("GET", "https://graph.microsoft.com/v1.0/" + path, token=token)
    items = []
    for r in data.get("value", [])[:100]:
        completed = (
            r.get("percentComplete", 0) == 100
            if source == "planner"
            else r.get("status") == "completed"
        )
        due = r.get("dueDateTime")
        if isinstance(due, dict):
            due = due.get("dateTime")
        items.append(
            {
                "id": r["id"],
                "title": str(r.get("title", ""))[:300],
                "completed": completed,
                "due": due or "",
                "progress": r.get("percentComplete", 100 if completed else 0),
            }
        )
    done = sum(i["completed"] for i in items)
    return {
        "status": "ok" if items else "empty",
        "source": "Microsoft Planner" if source == "planner" else "Microsoft To Do",
        "task_items": items,
        "chart": providers.series_chart(
            [
                {"label": "A fazer", "value": len(items) - done},
                {"label": "Concluídas", "value": done},
            ],
            [{"key": "value", "name": "Tarefas", "color": "#9d8bff"}],
        ),
        "kpis": [
            {"label": "A fazer", "value": len(items) - done},
            {"label": "Concluídas", "value": done},
        ],
        "message": "Fotografia das tarefas atuais, até 100 itens; não é histórico por período. Planner mostra tarefas atribuídas a você. "
        + (
            "Há mais resultados no aplicativo original."
            if data.get("@odata.nextLink")
            else ""
        ),
        "link": "https://planner.cloud.microsoft/"
        if source == "planner"
        else "https://to-do.office.com/tasks/",
        "suggestions": [
            "Confira prazos e conclua as tarefas no aplicativo original.",
            "A consulta depende das permissões e licenças da sua organização.",
        ],
    }
