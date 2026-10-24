"""Read-only public providers. Fixed HTTPS hosts; no user-supplied URLs or tokens."""

import json
import math
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse
import httpx
from defusedxml import ElementTree
from app.core.config import settings

ALLOWED_HOSTS = {
    "api.github.com",
    "api.bcb.gov.br",
    "servicodados.ibge.gov.br",
    "agenciabrasil.ebc.com.br",
    "rss.ebc.com.br",
    "www.alphavantage.co",
}
FEEDS = {
    "ibge": ("IBGE", "https://servicodados.ibge.gov.br/api/v3/noticias/?qtd=30"),
    "economia": (
        "Agência Brasil · Economia",
        "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",
    ),
    "politica": (
        "Agência Brasil · Política",
        "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",
    ),
}
SERIES = {
    "usd": (1, "Dólar comercial · venda", "R$/US$"),
    "selic": (432, "Meta Selic", "% a.a."),
    "ipca": (433, "IPCA mensal", "% ao mês"),
}


class ProviderError(Exception):
    pass


def get_bytes(url):
    # Never follow a redirect to an arbitrary host, including from RSS providers.
    try:
        with httpx.Client(
            timeout=httpx.Timeout(12, connect=5),
            headers={
                "User-Agent": "CommandCenter/0.2",
                "Accept": "application/json, application/rss+xml, application/xml",
            },
            follow_redirects=False,
        ) as client:
            for _ in range(3):
                parsed = urlparse(url)
                if (
                    parsed.scheme != "https"
                    or parsed.hostname not in ALLOWED_HOSTS
                    or parsed.username is not None
                    or parsed.port not in (None, 443)
                ):
                    raise ProviderError("Endereço da fonte não permitido.")
                with client.stream("GET", url) as response:
                    if response.is_redirect:
                        from urllib.parse import urljoin

                        url = urljoin(url, response.headers.get("location", ""))
                        continue
                    if response.status_code in (403, 429):
                        raise ProviderError(
                            "A fonte limitou as consultas. Tente novamente mais tarde."
                        )
                    if response.status_code == 404:
                        raise ProviderError(
                            "Fonte não encontrada. Repositórios privados não são acessíveis nesta integração pública."
                        )
                    if response.status_code == 409:
                        return b"[]"
                    if response.status_code != 200:
                        raise ProviderError("A fonte está indisponível no momento.")
                    raw = bytearray()
                    for chunk in response.iter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 3 * 1024 * 1024:
                            raise ProviderError(
                                "A resposta da fonte excedeu o limite de leitura."
                            )
                    return bytes(raw)
        raise ProviderError("A fonte redirecionou muitas vezes.")
    except ProviderError:
        raise
    except Exception:
        raise ProviderError(
            "Não foi possível consultar a fonte. Verifique a conexão e tente novamente."
        )


def get_json(url):
    try:
        return json.loads(get_bytes(url))
    except ProviderError:
        raise
    except Exception:
        raise ProviderError("A fonte retornou um formato inesperado.")


def clean(text):
    return unescape(re.sub(r"<[^>]*>", "", str(text)))[:300]


def safe_link(url):
    parsed = urlparse(url)
    return (
        url
        if parsed.scheme == "https" and parsed.hostname and not parsed.username
        else ""
    )


def series_chart(points, series, unit=""):
    return {"points": points, "series": series, "unit": unit}


def github_data(repository, start, end):
    if not repository:
        return {
            "status": "needs_config",
            "message": "Escolha um repositório público no formato dono/repositorio.",
            "source": "GitHub REST API",
        }
    if not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}", repository
    ):
        raise ProviderError("Repositório inválido.")
    base = "https://api.github.com/repos/" + repository
    repo = get_json(base)
    commits = get_json(
        base
        + "/commits?per_page=100&since="
        + start.isoformat()
        + "T00:00:00Z&until="
        + end.isoformat()
        + "T23:59:59Z"
    )
    if not isinstance(repo, dict) or not isinstance(commits, list):
        raise ProviderError("Resposta inesperada do GitHub.")
    counts = Counter()
    for c in commits:
        stamp = c.get("commit", {}).get("committer", {}).get("date", "")[:10]
        if stamp:
            counts[stamp] += 1
    points = []
    day = start
    while day <= end:
        points.append({"label": day.isoformat(), "value": counts[day.isoformat()]})
        day += timedelta(days=1)
    return {
        "status": "ok" if commits else "empty",
        "source": "GitHub REST API · branch padrão",
        "message": "Até 100 commits mais recentes no período; não inclui todas as branches. Repositórios públicos, sem acesso à sua conta.",
        "chart": series_chart(
            points, [{"key": "value", "name": "Commits", "color": "#5b9dff"}]
        ),
        "kpis": [
            {"label": "Commits recebidos", "value": len(commits)},
            {"label": "Estrelas atuais", "value": repo.get("stargazers_count", 0)},
            {
                "label": "Issues + PRs abertos",
                "value": repo.get("open_issues_count", 0),
            },
        ],
        "link": safe_link(repo.get("html_url", "")),
    }


def macro_data(code, start, end):
    number, name, unit = SERIES[code]
    # IPCA is monthly: a wider window supplies meaningful points without manufacturing daily values.
    beginning = start - timedelta(days=365) if code == "ipca" else start
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{number}/dados?formato=json&dataInicial={beginning:%d/%m/%Y}&dataFinal={end:%d/%m/%Y}"
    raw = get_json(url)
    if not isinstance(raw, list):
        raise ProviderError("Resposta inesperada do Banco Central.")
    points = []
    for r in raw:
        value = float(r["valor"])
        if math.isfinite(value):
            points.append(
                {
                    "label": datetime.strptime(r["data"], "%d/%m/%Y")
                    .date()
                    .isoformat(),
                    "value": value,
                }
            )
    points.sort(key=lambda p: p["label"])
    return {
        "status": "ok" if points else "empty",
        "source": f"Banco Central · SGS {number}",
        "message": "Últimos 12 meses; divulgação mensal."
        if code == "ipca"
        else "Valores oficiais nas datas disponíveis. Não é cotação em tempo real.",
        "chart": series_chart(
            points, [{"key": "value", "name": name, "color": "#48d8e8"}], unit
        ),
        "kpis": [
            {
                "label": name,
                "value": points[-1]["value"] if points else None,
                "unit": unit,
            }
        ],
        "data_date": points[-1]["label"] if points else None,
    }


def news_data(feed, start, end):
    source, url = FEEDS[feed]
    items = []
    if feed == "ibge":
        raw = get_json(url)
        for item in raw.get("items", []):
            try:
                stamp = (
                    datetime.strptime(item["data_publicacao"], "%d/%m/%Y %H:%M:%S")
                    .date()
                    .isoformat()
                )
            except (ValueError, KeyError):
                stamp = ""
            items.append(
                {
                    "title": clean(item.get("titulo", "")),
                    "url": safe_link(item.get("link", "")),
                    "date": stamp,
                }
            )
    else:
        try:
            root = ElementTree.fromstring(get_bytes(url))
        except ProviderError:
            raise
        except Exception:
            raise ProviderError("O feed de notícias não pôde ser lido.")
        for item in root.findall(".//item")[:30]:
            try:
                stamp = (
                    parsedate_to_datetime(item.findtext("pubDate", ""))
                    .date()
                    .isoformat()
                )
            except (ValueError, TypeError):
                stamp = ""
            items.append(
                {
                    "title": clean(item.findtext("title", "")),
                    "url": safe_link(item.findtext("link", "")),
                    "date": stamp,
                }
            )
    items = [
        i
        for i in items
        if i["url"]
        and (not i["date"] or start.isoformat() <= i["date"] <= end.isoformat())
    ]
    counts = Counter(i["date"] for i in items if i["date"])
    points = [{"label": day, "value": value} for day, value in sorted(counts.items())]
    return {
        "status": "ok" if items else "empty",
        "source": source,
        "message": "Volume dos itens recebidos neste feed (até 30), não de todas as notícias publicadas. Sem análise de sentimento.",
        "chart": series_chart(
            points, [{"key": "value", "name": "Notícias recebidas", "color": "#9b8aff"}]
        ),
        "items": items[:6],
        "kpis": [{"label": "Itens no recorte", "value": len(items)}],
    }


def stock_data(symbol, start, end):
    if not settings.alpha_vantage_api_key:
        return {
            "status": "needs_config",
            "source": "Alpha Vantage",
            "message": "Para cotações de empresas, configure ALPHA_VANTAGE_API_KEY no .env local. Também é possível usar uma análise de planilha com histórico de preços.",
        }
    if not symbol:
        return {
            "status": "needs_config",
            "source": "Alpha Vantage",
            "message": "Informe o código da empresa no provedor, por exemplo IBM.",
        }
    from urllib.parse import urlencode

    raw = get_json(
        "https://www.alphavantage.co/query?"
        + urlencode(
            {
                "function": "TIME_SERIES_DAILY",
                "symbol": symbol,
                "outputsize": "compact",
                "apikey": settings.alpha_vantage_api_key,
            }
        )
    )
    rows = raw.get("Time Series (Daily)")
    if not rows:
        raise ProviderError(
            "A cotação não está disponível. Confira símbolo, chave e limite do seu plano Alpha Vantage."
        )
    points = [
        {"label": day, "value": float(r["4. close"])}
        for day, r in sorted(rows.items())
        if start.isoformat() <= day <= end.isoformat()
        and math.isfinite(float(r["4. close"]))
    ]
    return {
        "status": "ok" if points else "empty",
        "source": "Alpha Vantage · fechamento diário",
        "message": "Até 100 pregões disponíveis; preço de fechamento, sem ajuste de dividendos. Não é cotação ao vivo. Moeda conforme a listagem do ativo.",
        "chart": series_chart(
            points, [{"key": "value", "name": symbol, "color": "#55b9ff"}]
        ),
        "kpis": [
            {
                "label": "Último fechamento",
                "value": points[-1]["value"] if points else None,
            }
        ],
        "data_date": points[-1]["label"] if points else None,
    }
