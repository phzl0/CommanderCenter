import io
from datetime import date, timedelta
import pandas as pd
from sqlalchemy import select
from app.models import User, Task, Activity, SessionToken, ImportFile, Report
from app.modules.reports import pdf_bytes
from app.core.config import settings
from tests.conftest import login_b


def upload_csv(client, raw=b"categoria;valor\nA;10\nA;20\nB;30\n"):
    r = client.post(
        "/api/imports",
        files={"file": ("vendas.csv", raw, "text/csv")},
        data={"separator": ";"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def project(client, name="Projeto"):
    r = client.post("/api/projects", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


def task(client, **kwargs):
    r = client.post("/api/tasks", json={"title": "Minha tarefa", **kwargs})
    assert r.status_code == 201, r.text
    return r.json()


def config():
    return {
        "columns": ["categoria", "valor"],
        "filters": [{"column": "valor", "operator": "gte", "value": "20"}],
        "aggregations": [
            {"column": "valor", "operation": "sum"},
            {"column": "valor", "operation": "mean"},
            {"column": "valor", "operation": "count"},
        ],
        "group_by": ["categoria"],
    }


def test_auth_origin_and_logout(env):
    c, factory = env
    assert c.get("/api/tasks").status_code == 401
    assert (
        c.post(
            "/api/auth/login", json={"email": "a@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    r = c.post(
        "/api/auth/login",
        json={"email": " A@EXAMPLE.COM ", "password": "strong-password-a"},
    )
    assert r.status_code == 200
    assert "httponly" in r.headers["set-cookie"].lower()
    assert c.get("/api/auth/me").json()["name"] == "Paulo"
    token = c.cookies.get("cc_session")
    with factory() as db:
        session = db.scalar(select(SessionToken))
        assert session.token_hash != token
    assert (
        c.post(
            "/api/projects",
            headers={"origin": "https://evil.example"},
            json={"name": "x"},
        ).status_code
        == 403
    )
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401
    c.cookies.set("cc_session", token)
    assert c.get("/api/auth/me").status_code == 401


def test_login_rate_limit(env):
    c, _ = env
    for _ in range(10):
        assert (
            c.post(
                "/api/auth/login", json={"email": "none@example.com", "password": "bad"}
            ).status_code
            == 401
        )
    assert (
        c.post(
            "/api/auth/login", json={"email": "none@example.com", "password": "bad"}
        ).status_code
        == 429
    )


def test_expired_disabled_session(client, env):
    _, factory = env
    from app.models import now

    with factory() as db:
        u = db.get(User, "user-a")
        u.active = False
        db.commit()
    assert client.get("/api/tasks").status_code == 401


def test_management_and_history(client, env):
    p = project(client)
    t = task(
        client,
        project_id=p["id"],
        due_date=str(date.today() - timedelta(days=2)),
        priority="high",
    )
    assert client.get("/api/dashboard").json()["counts"]["overdue_tasks"] == 1
    payload = {
        k: t[k]
        for k in [
            "title",
            "description",
            "project_id",
            "priority",
            "status",
            "due_date",
        ]
    }
    payload["status"] = "completed"
    assert client.put("/api/tasks/" + t["id"], json=payload).status_code == 200
    assert client.put("/api/tasks/" + t["id"], json=payload).status_code == 200
    items = client.get("/api/activities").json()["items"]
    assert len(items) == 1 and items[0]["origin"] == "automatic"
    assert (
        client.put(
            "/api/activities/" + items[0]["id"], json={"description": "alterar"}
        ).status_code
        == 409
    )
    counts = client.get("/api/dashboard").json()["counts"]
    assert counts["completed_tasks"] == 1 and counts["overdue_tasks"] == 0
    assert (
        client.put(
            "/api/projects/" + p["id"], json={"name": "Projeto", "status": "archived"}
        ).status_code
        == 200
    )
    assert client.get("/api/dashboard").json()["counts"]["active_projects"] == 0
    # Reopening and completing is a new historical event.
    payload["status"] = "pending"
    client.put("/api/tasks/" + t["id"], json=payload)
    payload["status"] = "completed"
    client.put("/api/tasks/" + t["id"], json=payload)
    assert client.get("/api/activities").json()["total"] == 2


def test_owner_isolation(client):
    p = project(client)
    t = task(client, project_id=p["id"])
    f = upload_csv(client)
    a = client.post(
        "/api/analyses",
        json={"name": "Privada", "import_id": f["id"], "config": config()},
    ).json()
    r = client.post(
        "/api/reports",
        json={
            "title": "Privado",
            "dataset": "analysis",
            "analysis_id": a["id"],
            "format": "csv",
        },
    ).json()
    login_b(client)
    assert client.get("/api/projects").json()["total"] == 0
    assert client.get("/api/tasks").json()["total"] == 0
    assert client.get("/api/imports").json() == []
    assert client.get("/api/reports").json() == []
    assert (
        client.put("/api/projects/" + p["id"], json={"name": "invasão"}).status_code
        == 404
    )
    assert (
        client.post(
            "/api/tasks", json={"title": "x", "project_id": p["id"]}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/activities", json={"description": "x", "task_id": t["id"]}
        ).status_code
        == 404
    )
    for path in [
        f"/api/imports/{f['id']}/preview",
        f"/api/imports/{f['id']}/download",
        f"/api/analyses/{a['id']}/run",
        f"/api/reports/{r['id']}/download",
    ]:
        assert client.get(path).status_code == 404
    assert client.delete("/api/imports/" + f["id"]).status_code == 404


def test_activity_relationship_and_validation(client):
    p = project(client)
    p2 = project(client, "Outro")
    t = task(client, project_id=p["id"])
    assert (
        client.post(
            "/api/activities",
            json={"description": "x", "project_id": p2["id"], "task_id": t["id"]},
        ).status_code
        == 422
    )
    r = client.post(
        "/api/activities",
        json={
            "description": "Trabalhei",
            "task_id": t["id"],
            "occurred_at": "2026-10-24T12:00:00-03:00",
        },
    )
    assert (
        r.status_code == 201
        and r.json()["project_id"] == p["id"]
        and r.json()["occurred_at"].startswith("2026-10-24T15:00")
    )
    assert (
        client.post(
            "/api/activities",
            json={"description": "x", "occurred_at": "2026-10-24T12:00:00"},
        ).status_code
        == 422
    )
    assert client.post("/api/tasks", json={"title": "   "}).status_code == 422
    assert (
        client.post("/api/tasks", json={"title": "x", "owner_id": "user-b"}).status_code
        == 422
    )


def test_pagination_search(client):
    for n in range(3):
        project(client, f"Projeto {n}")
    page = client.get("/api/projects?limit=2").json()
    assert len(page["items"]) == 2 and page["total"] == 3
    assert len(client.get("/api/projects?limit=2&offset=2").json()["items"]) == 1
    assert client.get("/api/projects?q=Projeto%201").json()["total"] == 1


def test_csv_analysis_saved_and_reused(client):
    f = upload_csv(client)
    assert f["preview"]["total_rows"] == 3
    r = client.post(f"/api/imports/{f['id']}/analyze", json=config())
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["total_rows"] == 2
    assert [s["value"] for s in result["summary"]] == [50, 25, 2]
    assert len(result["groups"]) == 2
    saved = client.post(
        "/api/analyses",
        json={"name": "Valores", "import_id": f["id"], "config": config()},
    ).json()
    assert client.get(f"/api/analyses/{saved['id']}/run").json() == result
    bad = config()
    bad["aggregations"] = [{"column": "categoria", "operation": "sum"}]
    assert client.post(f"/api/imports/{f['id']}/analyze", json=bad).status_code == 422
    bad = config()
    bad["columns"] = ["inexistente"]
    assert client.post(f"/api/imports/{f['id']}/analyze", json=bad).status_code == 422


def test_csv_encoding_and_decimal(client):
    raw = "produto;valor\nAção;12,50\nOutro;3,50\n".encode("latin-1")
    r = client.post(
        "/api/imports",
        files={"file": ("dados.csv", raw)},
        data={"encoding": "latin-1", "separator": ";", "decimal": ","},
    )
    assert r.status_code == 201, r.text
    out = client.post(
        "/api/imports/" + r.json()["id"] + "/analyze",
        json={"aggregations": [{"column": "valor", "operation": "sum"}]},
    )
    assert out.json()["summary"][0]["value"] == 16


def test_excel_sheets_and_empty_filter(client):
    data = io.BytesIO()
    with pd.ExcelWriter(data, engine="openpyxl") as writer:
        pd.DataFrame({"A": [1, 2]}).to_excel(writer, index=False, sheet_name="Primeira")
        pd.DataFrame({"B": ["x", None], "C": [4, 5]}).to_excel(
            writer, index=False, sheet_name="Segunda"
        )
    r = client.post("/api/imports", files={"file": ("teste.xlsx", data.getvalue())})
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["sheets"] == ["Primeira", "Segunda"]
    preview = client.get("/api/imports/" + f["id"] + "/preview?sheet=Segunda").json()
    assert preview["columns"][0]["name"] == "B"
    result = client.post(
        "/api/imports/" + f["id"] + "/analyze",
        json={"sheet": "Segunda", "filters": [{"column": "B", "operator": "is_empty"}]},
    ).json()
    assert result["total_rows"] == 1


def test_upload_rejections(client, monkeypatch):
    assert (
        client.post("/api/imports", files={"file": ("script.exe", b"x")}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/imports", files={"file": ("broken.xlsx", b"broken")}
        ).status_code
        == 422
    )
    monkeypatch.setattr(settings, "max_rows", 1)
    assert (
        client.post(
            "/api/imports", files={"file": ("big.csv", b"a\n1\n2\n")}
        ).status_code
        == 422
    )
    monkeypatch.setattr(settings, "max_upload_mb", 0)
    assert (
        client.post("/api/imports", files={"file": ("big.csv", b"a\n1\n")}).status_code
        == 413
    )


def test_exports_and_cascade(client, env):
    f = upload_csv(client)
    saved = client.post(
        "/api/analyses",
        json={"name": "Valores", "import_id": f["id"], "config": config()},
    ).json()
    for format in ["csv", "xlsx", "pdf"]:
        r = client.post(
            "/api/reports",
            json={
                "title": "Análise <segura>",
                "dataset": "analysis",
                "analysis_id": saved["id"],
                "format": format,
            },
        )
        assert r.status_code == 201, r.text
        content = client.get("/api/reports/" + r.json()["id"] + "/download").content
        if format == "csv":
            assert "categoria;valor" in content.decode("utf-8-sig")
        if format == "xlsx":
            excel = pd.ExcelFile(io.BytesIO(content))
            assert excel.sheet_names == ["Dados", "Resumo", "Agrupamentos"]
            assert len(pd.read_excel(excel)) == 2
        if format == "pdf":
            assert content.startswith(b"%PDF")
            open("/tmp/cc-report-qa.pdf", "wb").write(content)
    assert client.delete("/api/imports/" + f["id"]).status_code == 204
    assert (
        client.get("/api/analyses").json() == []
        and client.get("/api/reports").json() == []
    )
    assert list(settings.storage_dir.iterdir()) == []


def test_management_report_date_filters_and_formula_escape(client):
    project(client, '=HYPERLINK("evil")')
    r = client.post(
        "/api/reports",
        json={"title": "Projetos", "dataset": "projects", "format": "csv"},
    )
    assert r.status_code == 201
    content = client.get("/api/reports/" + r.json()["id"] + "/download").content.decode(
        "utf-8-sig"
    )
    assert "'=HYPERLINK" in content
    assert (
        client.post(
            "/api/reports",
            json={"title": "x", "date_from": "2026-10-24", "date_to": "2020-01-01"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/reports", json={"title": "x", "dataset": "analysis"}
        ).status_code
        == 422
    )
    r = client.post(
        "/api/reports",
        json={
            "title": "Vazio",
            "dataset": "projects",
            "format": "xlsx",
            "date_from": "2099-01-01",
        },
    )
    assert r.status_code == 201
    frame = pd.read_excel(
        io.BytesIO(client.get("/api/reports/" + r.json()["id"] + "/download").content)
    )
    assert frame.empty and "name" in frame.columns


def test_pdf_long_cells_fit_pages():
    frame = pd.DataFrame(
        {f"Coluna {n}": ["texto longo " * 1000, "\n" * 1000] for n in range(8)}
    )
    content = pdf_bytes("Relatório com textos extensos", frame, [], [])
    assert content.startswith(b"%PDF")
