from datetime import timedelta
import socket
import pytest
from app.modules import newsroom, providers, public_web
from app.models import DashboardWidget, PersonalEntry, now
from tests.conftest import login_b

RSS = b"""<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Esportes</title><item><title>Jogo de futebol</title><link>https://news.example.com/jogo?utm_source=rss</link><description>Resumo curto do jogo.</description><pubDate>Sat, 24 Oct 2026 12:00:00 GMT</pubDate><media:thumbnail url="https://images.example.com/foto.jpg"/></item></channel></rss>"""


def test_rss_atom_and_hostile_xml():
    title, items = newsroom.parse_feed(RSS, "https://news.example.com/feed")
    assert title == "Esportes" and len(items) == 1
    assert items[0]["image"] == "https://images.example.com/foto.jpg"
    assert items[0]["url"] == "https://news.example.com/jogo"
    atom = b'<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Teste</title><link href="https://example.com/a"/><summary>Texto</summary><updated>2026-10-24T10:00:00Z</updated></entry></feed>'
    assert newsroom.parse_feed(atom, "https://example.com")[1][0]["title"] == "Teste"
    hostile = b'<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&secret;</title><link>https://example.com/a</link></item></channel></rss>'
    with pytest.raises(providers.ProviderError):
        newsroom.parse_feed(hostile, "https://example.com")


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/feed",
        "https://127.0.0.1/a",
        "https://[::1]/a",
        "https://user:pass@example.com/feed",
        "https://example.com:444/feed",
        "https://localhost/feed",
    ],
)
def test_private_urls_rejected(url):
    with pytest.raises(providers.ProviderError):
        public_web.validate_url(url)


def test_dns_rebinding_guard(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **kw: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))
        ],
    )
    with pytest.raises(providers.ProviderError):
        public_web.resolve_public("public-looking.example")


def test_discovery_preview_and_own_sources(client, monkeypatch):
    def fetch(url, **kwargs):
        if url == "https://news.example.com/":
            return (
                b'<html><head><link rel="alternate" type="application/rss+xml" href="/feed"/></head></html>',
                "text/html",
                url,
            )
        return RSS, "application/rss+xml", url

    monkeypatch.setattr(newsroom, "public_fetch", fetch)
    initial = client.post("/api/sources/bootstrap").json()
    assert len(initial) == 9 and len({s["name"] for s in initial}) == 9
    r = client.post("/api/sources/preview", json={"url": "https://news.example.com/"})
    assert r.status_code == 200, r.text
    assert r.json()["resolved_url"] == "https://news.example.com/feed"
    payload = {
        "name": "Meu futebol",
        "category": "Futebol",
        "url": "https://news.example.com/feed",
        "enabled": True,
    }
    r = client.post("/api/sources", json=payload)
    assert r.status_code == 201, r.text
    source = r.json()
    assert (
        client.put(
            "/api/sources/" + source["id"], json={**payload, "category": "Jogos"}
        ).status_code
        == 200
    )
    login_b(client)
    assert client.put("/api/sources/" + source["id"], json=payload).status_code == 404
    assert client.delete("/api/sources/" + source["id"]).status_code == 404


def test_source_aggregation_keywords_dedup_and_reading(client, monkeypatch):
    from app.modules.intelligence import date_range

    start, end = date_range(30)

    def load(source):
        return "Feed", [
            newsroom.clean_item(
                "Futebol no campeonato",
                "https://example.com/noticia?utm_source=" + source["name"],
                "Resumo do jogo",
                "https://images.example.com/a.jpg",
                end.isoformat(),
            )
        ]

    monkeypatch.setattr(newsroom, "load_feed", load)
    workspace = client.post("/api/intelligence/bootstrap").json()
    w = next(w for w in workspace["widgets"] if w["kind"] == "news")
    data = client.get("/api/intelligence/widgets/" + w["id"] + "/data").json()
    assert data["status"] == "ok" and len(data["items"]) == 1
    assert len(data["items"][0]["other_sources"]) == 9
    assert "chart" not in data
    item = data["items"][0]
    r = client.post(
        "/api/sources/articles/state",
        json={
            k: item[k]
            for k in [
                "url",
                "title",
                "source",
                "category",
                "image",
                "description",
                "date",
            ]
        }
        | {"bookmarked": True, "read": True},
    )
    assert r.status_code == 200, r.text
    assert (
        client.get("/api/sources/articles?mode=saved").json()[0]["bookmarked"] is True
    )
    cached = client.get("/api/intelligence/widgets/" + w["id"] + "/data").json()
    assert cached["items"][0]["read"] is True
    config = w["config"] | {"news_exclude": "futebol"}
    r = client.put(
        "/api/intelligence/widgets/" + w["id"],
        json={k: w[k] for k in ["title", "kind", "visible", "wide"]}
        | {"config": config},
    )
    assert r.status_code == 200
    assert (
        client.get("/api/intelligence/widgets/" + w["id"] + "/data").json()["items"]
        == []
    )
    login_b(client)
    assert client.get("/api/sources/articles").json() == []


def test_soft_delete_undo_and_notifications(client, env):
    workspace = client.post("/api/intelligence/bootstrap").json()
    w = workspace["widgets"][0]
    assert client.delete("/api/intelligence/widgets/" + w["id"]).status_code == 204
    assert client.get("/api/intelligence/widgets/" + w["id"]).status_code == 404
    notice = client.post(
        "/api/notifications",
        json={"title": "Painel excluído", "action": {"kind": "widget", "id": w["id"]}},
    )
    assert notice.status_code == 201, notice.text
    assert client.get("/api/notifications").json()["unread"] == 1
    assert (
        client.post("/api/notifications/restore/widget/" + w["id"]).status_code == 200
    )
    assert client.get("/api/intelligence/widgets/" + w["id"]).status_code == 200
    assert client.post("/api/notifications/read-all").status_code == 204
    assert client.get("/api/notifications").json()["unread"] == 0
    assert client.delete("/api/intelligence/widgets/" + w["id"]).status_code == 204
    _, factory = env
    with factory() as db:
        row = db.get(DashboardWidget, w["id"])
        row.deleted_at = now() - timedelta(minutes=11)
        db.commit()
    assert (
        client.post("/api/notifications/restore/widget/" + w["id"]).status_code == 409
    )
    login_b(client)
    assert (
        client.post("/api/notifications/restore/widget/" + w["id"]).status_code == 404
    )
    assert client.get("/api/notifications").json()["items"] == []


def test_deleted_finance_not_exported_and_restored(client):
    from app.modules.intelligence import date_range

    day = date_range(30)[1].isoformat()
    r = client.post(
        "/api/intelligence/entries/finance",
        json={
            "description": "Despesa removida",
            "category": "Teste",
            "direction": "expense",
            "amount": "20.50",
            "entry_date": day,
        },
    )
    entry = r.json()
    assert (
        client.delete("/api/intelligence/entries/finance/" + entry["id"]).status_code
        == 204
    )
    assert client.get("/api/intelligence/entries/finance").json() == []
    report = client.post(
        "/api/reports",
        json={"title": "Financeiro", "dataset": "finance", "format": "csv"},
    ).json()
    assert (
        "Despesa removida"
        not in client.get("/api/reports/" + report["id"] + "/download").text
    )
    assert (
        client.post("/api/notifications/restore/finance/" + entry["id"]).status_code
        == 200
    )
    assert len(client.get("/api/intelligence/entries/finance").json()) == 1


def test_company_link_search_and_weather(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "alpha_vantage_api_key", "disposable-key")

    def get_json(url):
        if "SYMBOL_SEARCH" in url:
            return {
                "bestMatches": [
                    {
                        "1. symbol": "IBM",
                        "2. name": "IBM Corp",
                        "4. region": "United States",
                        "8. currency": "USD",
                    }
                ]
            }
        if "geocoding" in url:
            return {
                "results": [
                    {
                        "name": "Campinas",
                        "admin1": "São Paulo",
                        "country": "Brasil",
                        "latitude": -22.9,
                        "longitude": -47.1,
                    }
                ]
            }
        return {
            "current": {
                "temperature_2m": 26,
                "apparent_temperature": 27,
                "weather_code": 2,
                "wind_speed_10m": 8,
                "time": "2026-10-24T14:00",
            },
            "timezone": "America/Sao_Paulo",
            "daily": {
                "time": ["2026-10-24"],
                "weather_code": [2],
                "temperature_2m_max": [28],
                "temperature_2m_min": [18],
                "precipitation_probability_max": [20],
            },
        }

    monkeypatch.setattr(providers, "get_json", get_json)
    r = client.get(
        "/api/intelligence/company-search",
        params={"q": "https://finance.yahoo.com/quote/IBM/"},
    )
    assert r.status_code == 200 and r.json()["matches"][0]["currency"] == "USD"
    assert (
        client.get(
            "/api/intelligence/company-search", params={"q": "https://evil.example/IBM"}
        ).status_code
        == 422
    )
    city = client.get("/api/intelligence/city-search?q=Campinas").json()[0]
    w = client.post(
        "/api/intelligence/widgets",
        json={
            "title": "Meu clima",
            "kind": "weather",
            "config": {
                "city": city["label"],
                "latitude": city["latitude"],
                "longitude": city["longitude"],
            },
        },
    ).json()
    weather = client.get("/api/intelligence/widgets/" + w["id"] + "/data").json()
    assert (
        weather["weather"]["temperature"] == 26 and len(weather["weather"]["days"]) == 1
    )


def test_image_proxy_only_valid_images(client, monkeypatch):
    import io
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buffer, format="PNG")
    monkeypatch.setattr(
        newsroom,
        "public_fetch",
        lambda *a, **kw: (buffer.getvalue(), "text/plain", a[0]),
    )
    response = client.get(
        "/api/sources/image", params={"url": "https://example.com/photo.png"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    monkeypatch.setattr(
        newsroom,
        "public_fetch",
        lambda *a, **kw: (
            b'<svg xmlns="http://www.w3.org/2000/svg"/>',
            "image/svg+xml",
            a[0],
        ),
    )
    assert (
        client.get(
            "/api/sources/image", params={"url": "https://example.com/photo.svg"}
        ).status_code
        == 422
    )
    client.post("/api/auth/logout")
    assert (
        client.get(
            "/api/sources/image", params={"url": "https://example.com/photo.png"}
        ).status_code
        == 401
    )


def test_category_filter_before_limit_and_failed_source_cooldown(
    client, env, monkeypatch
):
    from app.models import NewsSource
    from app.modules.intelligence import WidgetConfig, date_range

    client.post("/api/sources/bootstrap")
    _, factory = env
    calls = []

    def failing(source):
        calls.append(source["name"])
        raise providers.ProviderError("Temporariamente indisponível")

    monkeypatch.setattr(newsroom, "load_feed", failing)
    with factory() as db:
        for i in range(7):
            db.add(
                NewsSource(
                    owner_id="user-a",
                    name=f"Fonte {i}",
                    category="Jogos" if i == 6 else "Geral",
                    url=f"https://example.com/{i}",
                    kind="rss",
                )
            )
        db.commit()
        from app.models import User

        user = db.get(User, "user-a")
        start, end = date_range(30)
        config = WidgetConfig(news_category="Jogos")
        data = newsroom.aggregate(db, user, config, start, end)
        assert data["status"] == "unavailable" and calls == ["Fonte 6"]
        newsroom.aggregate(db, user, config, start, end, refresh=True)
        assert calls == ["Fonte 6"]


def test_feed_images_media_without_type_atom_and_encoded_content():
    media = b'<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>Foto</title><link>https://example.com/a</link><media:content url="https://example.com/photo.jpg"/></item></channel></rss>'
    assert (
        newsroom.parse_feed(media, "https://example.com")[1][0]["image"]
        == "https://example.com/photo.jpg"
    )
    atom = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Foto</title><link href="https://example.com/a"/><link rel="enclosure" type="image/jpeg" href="/photo.jpg"/></entry></feed>'
    assert (
        newsroom.parse_feed(atom, "https://example.com")[1][0]["image"]
        == "https://example.com/photo.jpg"
    )
    encoded = b'<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Foto</title><link>https://example.com/a</link><content:encoded><![CDATA[<p><img src="https://example.com/photo.jpg"></p>]]></content:encoded></item></channel></rss>'
    assert (
        newsroom.parse_feed(encoded, "https://example.com")[1][0]["image"]
        == "https://example.com/photo.jpg"
    )
