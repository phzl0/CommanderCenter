import { useEffect, useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
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
  const [rows, setRows] = useState(items);
  useEffect(() => setRows(items), [items]);
  return (
    <div className={"news-feed " + (compact ? "compact" : "")}>
      {(compact ? rows.slice(0, 4) : rows).map((item) => (
        <article key={item.url} className={item.read ? "read" : ""}>
          <a
            className="news-visual"
            href={item.url}
            target="_blank"
            rel="noreferrer"
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
            >
              {item.title}
            </a>
            {!compact && item.description && <p>{item.description}</p>}
            <div className="news-meta">
              <time>{dateLabel(item.date)}</time>
              {!!item.other_sources && item.other_sources.length > 1 && (
                <span title={item.other_sources.join(", ")}>
                  +{item.other_sources.length - 1} fontes
                </span>
              )}
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="quiet"
            >
              Ler na fonte <ExternalLink size={13} />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
