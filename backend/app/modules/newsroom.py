"""Reusable private sources and concise RSS/Atom/IBGE metadata; no full-article scraping."""

import hashlib
import io
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from urllib.parse import urlparse, urljoin, urlencode, parse_qsl, urlunparse
from defusedxml import ElementTree
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.models import (
    User,
    NewsSource,
    SourceSettings,
    ArticleState,
    DashboardWidget,
    now,
)
from app.modules.management import StrictModel, owned, dump
from app.modules import providers
from app.modules.public_web import public_fetch, validate_url
from app.modules.notifications import record

router = APIRouter(prefix="/api/sources", tags=["Fontes e notícias"])
DEFAULTS = [
    (
        "Agência Brasil",
        "Principais",
        "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
        "rss",
    ),
    (
        "G1 · Economia",
        "Economia e bolsa",
        "https://g1.globo.com/rss/g1/economia/",
        "rss",
    ),
    (
        "IBGE",
        "Indicadores",
        "https://servicodados.ibge.gov.br/api/v3/noticias/?qtd=30",
        "ibge",
    ),
]


BUILTINS = [
    (
        "politica-g1",
        "G1 · Política",
        "Política",
        "https://g1.globo.com/rss/g1/politica/",
        "rss",
    ),
    (
        "politica-camara",
        "Agência Câmara",
        "Política",
        "https://www.camara.leg.br/noticias/rss/ultimas-noticias",
        "rss",
    ),
    (
        "politica-senado",
        "Agência Senado",
        "Política",
        "https://www12.senado.leg.br/noticias/ultimas",
        "auto",
    ),
    (
        "futebol-ge",
        "ge · Futebol",
        "Futebol",
        "https://ge.globo.com/rss/ge/futebol/",
        "rss",
    ),
    (
        "futebol-uol",
        "UOL · Futebol",
        "Futebol",
        "https://www.uol.com.br/esporte/futebol/ultimas/index.xml",
        "auto",
    ),
    (
        "futebol-espn",
        "ESPN · Futebol",
        "Futebol",
        "https://www.espn.com.br/futebol/",
        "auto",
    ),
    ("economia-g1", "G1 · Economia", "Economia", DEFAULTS[1][2], "rss"),
    (
        "economia-infomoney",
        "InfoMoney",
        "Economia",
        "https://www.infomoney.com.br/feed/",
        "rss",
    ),
    ("economia-ibge", "IBGE", "Economia", DEFAULTS[2][2], "ibge"),
]


class SourceInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=8, max_length=2048)
    enabled: bool = True


class PreviewInput(StrictModel):
    url: str = Field(min_length=8, max_length=2048)


class ArticleInput(StrictModel):
    url: str = Field(max_length=2048)
    title: str = Field(min_length=1, max_length=500)
    source: str = Field(default="", max_length=100)
    category: str = Field(default="", max_length=80)
    image: str = Field(default="", max_length=2048)
    description: str = Field(default="", max_length=1000)
    date: str = Field(default="", max_length=40)
    bookmarked: bool | None = None
    read: bool | None = None


def ensure_sources(db, user):
    setting = db.get(SourceSettings, user.id)
    if setting and setting.catalogue_version >= 1:
        return
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    setting = db.get(SourceSettings, user.id, populate_existing=True)
    if setting and setting.catalogue_version >= 1:
        return
    if not setting:
        setting = SourceSettings(owner_id=user.id)
        db.add(setting)
    for key, name, category, url, kind in BUILTINS:
        row = db.scalar(
            select(NewsSource).where(
                NewsSource.owner_id == user.id, NewsSource.url == url
            )
        )
        if (
            row
            and not row.builtin_key
            and (
                row.name not in [name, "G1 · Economia", "IBGE"]
                or row.category not in [category, "Economia e bolsa", "Indicadores"]
            )
        ):
            row = None
        if not row:
            row = NewsSource(owner_id=user.id, url=url)
            db.add(row)
        row.builtin_key = key
        row.name = name
        row.category = category
        row.kind = kind
        row.enabled = True
        row.deleted_at = None
    setting.catalogue_version = 1
    db.flush()


def active_source(db, user, identity):
    row = owned(db, NewsSource, identity, user)
    if row.deleted_at:
        raise HTTPException(404, "Fonte não encontrada.")
    return row


def source_dict(row):
    return {
        k: v for k, v in dump(row).items() if k not in ("cached_items", "deleted_at")
    }


def invalidate(db, user):
    for w in db.scalars(
        select(DashboardWidget).where(
            DashboardWidget.owner_id == user.id, DashboardWidget.kind == "news"
        )
    ):
        w.cached_data = None
        w.cached_at = None


def canonical_url(url):
    p = urlparse(url)
    pairs = [
        (k, v)
        for k, v in parse_qsl(p.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in ("fbclid", "gclid")
    ]
    return urlunparse(
        (
            p.scheme.lower(),
            p.netloc.lower(),
            p.path or "/",
            p.params,
            urlencode(pairs),
            "",
        )
    ).rstrip("/")


def article_key(url):
    return hashlib.sha256(canonical_url(url).encode()).hexdigest()


def normalize(text):
    return "".join(
        c
        for c in unicodedata.normalize("NFKD", text.casefold())
        if not unicodedata.combining(c)
    )


def date_text(text):
    try:
        return parsedate_to_datetime(text).isoformat()
    except (ValueError, TypeError):
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat()
        except (ValueError, TypeError):
            return ""


class ImageFinder(HTMLParser):
    def __init__(self):
        super().__init__()
        self.url = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and not self.url:
            self.url = attrs.get("src", "")


class FeedFinder(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if (
            tag == "link"
            and "alternate" in attrs.get("rel", "")
            and attrs.get("type", "") in ("application/rss+xml", "application/atom+xml")
        ):
            self.links.append(attrs.get("href", ""))


def clean_item(title, url, description="", image="", date=""):
    title = providers.clean(title).strip()
    url = providers.safe_link(url)
    if not title or not url:
        return None
    try:
        validate_url(url)
    except providers.ProviderError:
        return None
    image = providers.safe_link(image)
    if image:
        try:
            validate_url(image)
        except providers.ProviderError:
            image = ""
    return {
        "title": providers.clean(title)[:300],
        "url": canonical_url(url),
        "description": providers.clean(description)[:300],
        "image": image,
        "date": date,
        "article_key": article_key(url),
    }


def feed_image(node, description, base):
    for child in node.iter():
        tag = child.tag.rsplit("}", 1)[-1]
        image_type = child.get("type", "").startswith("image/")
        media = child.tag.startswith("{http://search.yahoo.com/mrss/}")
        if child.get("url") and (
            tag == "thumbnail"
            or (
                tag in ("content", "enclosure")
                and (image_type or child.get("medium") == "image" or media)
            )
        ):
            return urljoin(base, child.get("url"))
        if (
            tag == "link"
            and child.get("rel") == "enclosure"
            and image_type
            and child.get("href")
        ):
            return urljoin(base, child.get("href"))
    for markup in [
        description,
        node.findtext("{http://purl.org/rss/1.0/modules/content/}encoded", ""),
    ]:
        finder = ImageFinder()
        finder.feed(markup)
        if finder.url:
            return urljoin(base, finder.url)
    return ""


def parse_feed(raw, base):
    try:
        root = ElementTree.fromstring(raw)
    except Exception:
        raise providers.ProviderError(
            "O endereço não contém um RSS/Atom válido. Informe o link do feed ou um site que divulgue seu RSS."
        )
    items = []
    title = ""
    atom = "{http://www.w3.org/2005/Atom}"
    if root.tag.endswith("feed"):
        title = root.findtext(atom + "title", "")
        for node in root.findall(atom + "entry")[:40]:
            link = next(
                (
                    n.get("href", "")
                    for n in node.findall(atom + "link")
                    if n.get("rel", "alternate") == "alternate"
                ),
                "",
            )
            description = node.findtext(atom + "summary", "") or node.findtext(
                atom + "content", ""
            )
            item = clean_item(
                node.findtext(atom + "title", ""),
                urljoin(base, link),
                description,
                feed_image(node, description, base),
                date_text(
                    node.findtext(atom + "published", "")
                    or node.findtext(atom + "updated", "")
                ),
            )
            if item:
                items.append(item)
    else:
        title = root.findtext("./channel/title", "")
        for node in root.findall(".//item")[:40]:
            description = node.findtext("description", "")
            image = feed_image(node, description, base)
            item = clean_item(
                node.findtext("title", ""),
                urljoin(base, node.findtext("link", "")),
                description,
                urljoin(base, image) if image else "",
                date_text(node.findtext("pubDate", "")),
            )
            if item:
                items.append(item)
    if not items:
        raise providers.ProviderError(
            "O feed não contém manchetes com links HTTPS válidos."
        )
    return providers.clean(title), items


class HeadlineFinder(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base = base
        self.items = []
        self.link = None
        self.text = []
        self.image = ""
        self.title = []
        self.in_title = False
        self.skip = 0
        self.script = False
        self.scripts = []
        self.script_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("nav", "header", "footer", "style", "noscript"):
            self.skip += 1
        if tag == "script":
            self.script = attrs.get("type") == "application/ld+json"
            self.script_text = []
            return
        if tag == "title":
            self.in_title = True
        if tag == "a" and not self.skip and len(self.items) < 200:
            self.link = urljoin(self.base, attrs.get("href", ""))
            self.text = []
            self.image = ""
        if tag == "img" and self.link:
            src = attrs.get("src") or attrs.get("data-src") or ""
            if src and not src.startswith("data:"):
                self.image = urljoin(self.base, src)

    def handle_data(self, data):
        if self.script:
            self.script_text.append(data)
        if self.in_title:
            self.title.append(data)
        if self.link and not self.skip:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag in ("nav", "header", "footer", "style", "noscript"):
            self.skip = max(0, self.skip - 1)
        if tag == "script":
            if self.script:
                try:
                    self.scripts.append(json.loads("".join(self.script_text)))
                except (ValueError, RecursionError):
                    pass
            self.script = False
        if tag == "title":
            self.in_title = False
        if tag == "a" and self.link:
            title = providers.clean(" ".join(self.text))
            parsed = urlparse(self.link)
            if (
                35 <= len(title) <= 500
                and parsed.hostname == urlparse(self.base).hostname
                and len(parsed.path) > 10
            ):
                item = clean_item(title, self.link, "", self.image, "")
                if item:
                    self.items.append(item)
            self.link = None


def html_headlines(raw, base):
    finder = HeadlineFinder(base)
    finder.feed(raw.decode("utf-8", "replace"))
    structured = []

    def visit(node, depth=0):
        if depth > 15 or len(structured) >= 60:
            return
        if isinstance(node, list):
            for item in node[:500]:
                visit(item, depth + 1)
        elif isinstance(node, dict):
            types = node.get("@type", [])
            types = [types] if isinstance(types, str) else types
            if isinstance(types, list) and any(
                t in ("NewsArticle", "Article", "ReportageNewsArticle") for t in types
            ):
                image = node.get("image", "")
                if isinstance(image, list):
                    image = image[0] if image else ""
                if isinstance(image, dict):
                    image = image.get("url", "")
                entity = node.get("mainEntityOfPage", "")
                address = node.get("url") or (
                    entity.get("@id", "") if isinstance(entity, dict) else entity
                )
                if isinstance(address, str) and address:
                    item = clean_item(
                        node.get("headline", ""),
                        urljoin(base, address),
                        node.get("description", ""),
                        urljoin(base, image)
                        if isinstance(image, str) and image
                        else "",
                        node.get("datePublished", ""),
                    )
                    if item:
                        structured.append(item)
            for child in node.values():
                if isinstance(child, (dict, list)):
                    visit(child, depth + 1)

    for node in finder.scripts:
        visit(node)
    unique = {}
    for item in structured + finder.items:
        address = urlparse(item["url"])
        # Known publishers include navigation and promotional links in article lists.
        if (
            address.hostname == "www12.senado.leg.br"
            and "/noticias/materias/" not in address.path
        ):
            continue
        if (
            address.hostname == "www.espn.com.br"
            and "/artigo/_/id/" not in address.path
        ):
            continue
        unique.setdefault(item["url"], item)
        if len(unique) >= 40:
            break
    if not unique:
        raise providers.ProviderError(
            "Não encontramos manchetes nesta página. Ela pode exigir JavaScript. Escolha uma fonte pronta ou um RSS público."
        )
    return providers.clean("".join(finder.title))[:100] or urlparse(
        base
    ).hostname, list(unique.values())


def read_public_news(url):
    raw, content_type, final = public_fetch(url)
    if "html" not in content_type.lower() and not raw.lstrip().lower().startswith(
        (b"<!doctype html", b"<html")
    ):
        title, items = parse_feed(raw, final)
        return title, items, final, "rss", []
    finder = FeedFinder()
    finder.feed(raw.decode("utf-8", "replace"))
    candidates = [urljoin(final, link) for link in finder.links[:2]]
    for candidate in candidates:
        try:
            validate_url(candidate)
            body, _, resolved = public_fetch(candidate)
            title, items = parse_feed(body, resolved)
            return title, items, resolved, "rss", candidates
        except providers.ProviderError:
            continue
    title, items = html_headlines(raw, final)
    return title, items, final, "auto", candidates


def preview_url(url):
    validate_url(url)
    if url == DEFAULTS[2][2]:
        title, items = load_feed({"kind": "ibge", "url": url, "name": "IBGE"})
        kind = "ibge"
        final = url
        candidates = []
    else:
        title, items, final, kind, candidates = read_public_news(url)
    return {
        "resolved_url": final,
        "title": title,
        "items": items[:3],
        "candidates": candidates,
        "kind": kind,
    }


def load_feed(source):
    if source["kind"] == "ibge":
        data = providers.get_json(DEFAULTS[2][2])
        items = []
        for row in data.get("items", [])[:40]:
            image = ""
            try:
                images = json.loads(row.get("imagens", "{}"))
                image = images.get("image_intro", "")
                if image:
                    image = urljoin("https://agenciadenoticias.ibge.gov.br/", image)
            except (ValueError, TypeError):
                pass
            try:
                date = datetime.strptime(
                    row["data_publicacao"], "%d/%m/%Y %H:%M:%S"
                ).isoformat()
            except (ValueError, KeyError):
                date = ""
            item = clean_item(
                row.get("titulo", ""),
                row.get("link", ""),
                row.get("introducao", ""),
                image,
                date,
            )
            if item:
                items.append(item)
        return "IBGE", items
    title, items, *_ = read_public_news(source["url"])
    return title, items


@router.post("/bootstrap")
def bootstrap(db: Session = Depends(get_db), user: User = Depends(current_user)):
    ensure_sources(db, user)
    db.commit()
    return [
        source_dict(s)
        for s in db.scalars(
            select(NewsSource)
            .where(NewsSource.owner_id == user.id, NewsSource.deleted_at.is_(None))
            .order_by(NewsSource.created_at, NewsSource.id)
        )
    ]


@router.post("/preview")
def preview(data: PreviewInput, user: User = Depends(current_user)):
    try:
        return preview_url(data.url)
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))


@router.post("", status_code=201)
def add_source(
    data: SourceInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    ensure_sources(db, user)
    if (
        len(
            list(
                db.scalars(
                    select(NewsSource.id).where(
                        NewsSource.owner_id == user.id, NewsSource.deleted_at.is_(None)
                    )
                )
            )
        )
        >= 30
    ):
        raise HTTPException(422, "Limite de 30 fontes por conta.")
    try:
        result = preview_url(data.url)
    except providers.ProviderError as e:
        raise HTTPException(422, str(e))
    row = NewsSource(
        owner_id=user.id,
        **data.model_dump(exclude={"url"}),
        url=result["resolved_url"],
        kind=result.get("kind", "rss"),
        cached_items=None,
    )
    db.add(row)
    invalidate(db, user)
    db.commit()
    return source_dict(row)


@router.put("/{identity}")
def edit_source(
    identity: str,
    data: SourceInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    row = active_source(db, user, identity)
    if row.builtin_key:
        raise HTTPException(
            422, "Fonte padrão: use o cadastro avançado para adicionar uma alternativa."
        )
    if data.url != row.url:
        try:
            result = preview_url(data.url)
        except providers.ProviderError as e:
            raise HTTPException(422, str(e))
        row.url = result["resolved_url"]
        row.kind = result.get("kind", "rss")
        row.cached_items = None
        row.checked_at = None
    row.name = data.name
    row.category = data.category
    row.enabled = data.enabled
    invalidate(db, user)
    db.commit()
    return source_dict(row)


@router.delete("/{identity}", status_code=204)
def delete_source(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    row = active_source(db, user, identity)
    if row.builtin_key:
        raise HTTPException(422, "As três fontes padrão de cada categoria são fixas.")
    row.deleted_at = now()
    invalidate(db, user)
    db.commit()


@router.get("/image")
def image(url: str, user: User = Depends(current_user)):
    try:
        raw, content_type, _ = public_fetch(url, max_bytes=2 * 1024 * 1024)
        with Image.open(io.BytesIO(raw)) as image:
            if (
                image.format not in ("JPEG", "PNG", "WEBP", "GIF")
                or image.width * image.height > 20_000_000
            ):
                raise ValueError()
            image.verify()
        media = {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
            "GIF": "image/gif",
        }
        with Image.open(io.BytesIO(raw)) as image:
            kind = image.format
        return Response(
            raw,
            media_type=media[kind],
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except Exception:
        raise HTTPException(422, "Imagem indisponível.")


@router.get("/articles")
def saved_articles(
    mode: str = "saved",
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    query = select(ArticleState).where(ArticleState.owner_id == user.id)
    if mode == "saved":
        query = query.where(ArticleState.bookmarked.is_(True))
    elif mode == "read":
        query = query.where(ArticleState.read_at.is_not(None))
    return [
        {**dump(r), "date": r.published_date, "read": bool(r.read_at)}
        for r in db.scalars(query.order_by(ArticleState.created_at.desc()).limit(100))
    ]


@router.post("/articles/state")
def article_state(
    data: ArticleInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    item = clean_item(data.title, data.url, data.description, data.image, data.date)
    if not item:
        raise HTTPException(422, "Link de notícia inválido.")
    key = item["article_key"]
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    row = db.scalar(
        select(ArticleState).where(
            ArticleState.owner_id == user.id, ArticleState.article_key == key
        )
    )
    if not row:
        row = ArticleState(
            owner_id=user.id, article_key=key, url=item["url"], title=item["title"]
        )
        db.add(row)
    for field in ("title", "image", "description"):
        setattr(row, field, item[field])
    row.source = data.source
    row.category = data.category
    row.published_date = data.date
    if data.bookmarked is not None:
        row.bookmarked = data.bookmarked
    if data.read is not None:
        row.read_at = now() if data.read else None
    db.commit()
    return {"article_key": key, "bookmarked": row.bookmarked, "read": bool(row.read_at)}


def annotate(db, user, data):
    if not data.get("items"):
        return data
    keys = [i.get("article_key") or article_key(i["url"]) for i in data["items"]]
    states = {
        r.article_key: r
        for r in db.scalars(
            select(ArticleState).where(
                ArticleState.owner_id == user.id, ArticleState.article_key.in_(keys)
            )
        )
    }
    items = []
    for item in data["items"]:
        key = item.get("article_key") or article_key(item["url"])
        state = states.get(key)
        items.append(
            {
                **item,
                "article_key": key,
                "bookmarked": bool(state and state.bookmarked),
                "read": bool(state and state.read_at),
            }
        )
    return {**data, "items": items}


def aggregate(db, user, config, start, end, refresh=False):
    ensure_sources(db, user)
    query = select(NewsSource).where(
        NewsSource.owner_id == user.id,
        NewsSource.deleted_at.is_(None),
        NewsSource.enabled.is_(True),
    )
    if config.news_source_ids:
        query = query.where(NewsSource.id.in_(config.news_source_ids))
    sources = list(db.scalars(query.order_by(NewsSource.created_at, NewsSource.id)))
    if config.news_category:
        sources = [
            s
            for s in sources
            if normalize(s.category) == normalize(config.news_category)
        ]
    sources = sources[:30]
    if not sources:
        return {
            "status": "needs_config",
            "source": "Suas fontes",
            "message": "Selecione ou ative fontes na central Fontes.",
            "items": [],
        }
    items = []
    errors = []
    futures = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for s in sources:
            if s.checked_at and (now() - s.checked_at).total_seconds() < (
                30 if refresh else 600
            ):
                continue
            futures[s.id] = pool.submit(
                load_feed, {"kind": s.kind, "url": s.url, "name": s.name}
            )
        for s in sources:
            if s.id in futures:
                try:
                    _, fresh = futures[s.id].result()
                    s.cached_items = fresh
                    s.checked_at = now()
                    s.last_error = None
                except Exception as e:
                    s.checked_at = now()
                    s.last_error = (
                        str(e)[:500]
                        if isinstance(e, providers.ProviderError)
                        else "A fonte retornou conteúdo incompatível."
                    )
                    record(
                        db,
                        user,
                        "Fonte de notícias indisponível",
                        s.name + ": " + s.last_error,
                        level="warning",
                        fingerprint="source:" + s.id,
                    )
            if s.last_error:
                errors.append({"source": s.name, "message": s.last_error})
            for item in s.cached_items or []:
                if (
                    item.get("date")
                    and not start.isoformat() <= item["date"][:10] <= end.isoformat()
                ):
                    continue
                text = normalize(item["title"] + " " + item.get("description", ""))
                include = [
                    normalize(k.strip())
                    for k in config.news_keywords.split(",")
                    if k.strip()
                ]
                exclude = [
                    normalize(k.strip())
                    for k in config.news_exclude.split(",")
                    if k.strip()
                ]
                if include and not any(k in text for k in include):
                    continue
                if any(k in text for k in exclude):
                    continue
                items.append(
                    {
                        **item,
                        "source": s.name,
                        "category": s.category,
                        "source_id": s.id,
                        "stale": bool(s.last_error),
                        "source_checked_at": s.checked_at.isoformat() + "Z"
                        if s.checked_at
                        else None,
                    }
                )
    dedup = {}
    titles = {}
    for item in items:
        key = item["article_key"]
        title_key = re.sub(r"\W+", "", normalize(item["title"]))
        duplicate = dedup.get(key) or titles.get(title_key)
        if duplicate:
            if item["source"] not in duplicate["other_sources"]:
                duplicate["other_sources"].append(item["source"])
            continue
        item["other_sources"] = [item["source"]]
        dedup[key] = item
        titles[title_key] = item
    items = sorted(dedup.values(), key=lambda i: i.get("date", ""), reverse=True)[:60]
    db.commit()
    return {
        "status": "ok"
        if items
        else "unavailable"
        if len(errors) == len(sources)
        else "empty",
        "source": "Radar · " + str(len(sources)) + " fontes",
        "message": "Manchetes e trechos fornecidos pelos feeds. Sem reprodução de matérias completas. Duplicatas agrupadas por link ou título igual.",
        "items": items,
        "source_errors": errors,
        "suggestions": [
            "Ajuste palavras-chave e categorias em Configurar painel.",
            "Compare a cobertura e confira a data na fonte original.",
        ],
        "kpis": [
            {"label": "Notícias no recorte", "value": len(items)},
            {"label": "Fontes ativas", "value": len(sources)},
        ],
    }
