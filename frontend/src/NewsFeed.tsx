import { useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ExternalLink,
  Newspaper,
  Eye,
} from "lucide-react";
import { api, send } from "./api";
import { notify } from "./feedback";
export type NewsItem = {
  article_key?: string;
  title: string;
  url: string;
  date: string;
  image?: string;
  description?: string;
  source?: string;
  category?: string;
  bookmarked?: boolean;
  read?: boolean;
  other_sources?: string[];
  stale?: boolean;
};
const dateLabel = (date: string) => {
  if (!date) return "Data não informada";
  const d = new Date(date.length === 10 ? date + "T12:00:00" : date);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: date.length > 10 ? "short" : undefined,
      });
};
function NewsImage({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return !url || failed ? (
    <div className="news-image-placeholder">
      <Newspaper size={28} />
    </div>
  ) : (
    <img
      loading="lazy"
      referrerPolicy="no-referrer"
      src={"/api/sources/image?url=" + encodeURIComponent(url)}
      alt={title}
      onError={() => setFailed(true)}
    />
  );
}
export default function NewsFeed({
  items,
  compact = false,
  onItemChange,
}: {
  items: NewsItem[];
  compact?: boolean;
  onItemChange?: (
    url: string,
    patch: { bookmarked: boolean; read: boolean },
  ) => void;
}) {
  const [rows, setRows] = useState(items),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setRows(items), [items]);
  async function change(
    item: NewsItem,
    patch: { bookmarked?: boolean; read?: boolean },
  ) {
    setBusy(item.url);
    try {
      const result = await api<{ bookmarked: boolean; read: boolean }>(
        "/sources/articles/state",
        send("POST", {
          url: item.url,
          title: item.title,
          source: item.source || "",
          category: item.category || "",
          description: item.description || "",
          image: item.image || "",
          date: item.date || "",
          ...patch,
        }),
      );
      setRows((old) =>
        old.map((r) => (r.url === item.url ? { ...r, ...result } : r)),
      );
      onItemChange?.(item.url, result);
      if (patch.bookmarked !== undefined)
        notify({
          title: patch.bookmarked
            ? "Notícia salva para ler depois"
            : "Notícia removida dos salvos",
        });
      window.dispatchEvent(new Event("cc-reading-changed"));
    } catch (e) {
      notify({ title: (e as Error).message, level: "error" });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className={"news-feed " + (compact ? "compact" : "")}>
      {(compact ? rows.slice(0, 4) : rows).map((item) => (
        <article key={item.url} className={item.read ? "read" : ""}>
          <a
            className="news-visual"
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (!item.read) change(item, { read: true });
            }}
          >
            <NewsImage url={item.image || ""} title={item.title} />
          </a>
          <div className="news-content">
            <div className="news-byline">
              <span>{item.category || "Notícias"}</span>
              <small>{item.source || "Fonte original"}</small>
              {item.stale && <b>Consulta anterior</b>}
            </div>
            <a
              className="news-title"
              href={item.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                if (!item.read) change(item, { read: true });
              }}
            >
              {item.title}
            </a>
            {!compact && item.description && <p>{item.description}</p>}
            <div className="news-meta">
              <time>{dateLabel(item.date)}</time>
              {item.read && (
                <span>
                  <Check size={12} />
                  Lida
                </span>
              )}
              {!!item.other_sources && item.other_sources.length > 1 && (
                <span title={item.other_sources.join(", ")}>
                  +{item.other_sources.length - 1} fontes
                </span>
              )}
            </div>
            <div className="news-actions">
              <button
                className={"quiet " + (item.bookmarked ? "saved" : "")}
                aria-label={
                  (item.bookmarked
                    ? "Remover dos salvos: "
                    : "Salvar notícia: ") + item.title
                }
                disabled={busy === item.url}
                onClick={() => change(item, { bookmarked: !item.bookmarked })}
              >
                {item.bookmarked ? (
                  <BookmarkCheck size={14} />
                ) : (
                  <Bookmark size={14} />
                )}{" "}
                {item.bookmarked ? "Salva" : "Salvar"}
              </button>
              {!compact && (
                <>
                  <button
                    className="quiet"
                    disabled={busy === item.url}
                    onClick={() => change(item, { read: !item.read })}
                  >
                    <Eye size={14} />
                    {item.read ? "Marcar não lida" : "Marcar como lida"}
                  </button>
                  <a
                    className="quiet"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (!item.read) change(item, { read: true });
                    }}
                  >
                    Ler na fonte <ExternalLink size={13} />
                  </a>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
