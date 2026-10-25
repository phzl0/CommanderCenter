import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import NewsFeed, { type NewsItem } from "./NewsFeed";
export default function NewsCarousel({ items }: { items: NewsItem[] }) {
  const [rows, setRows] = useState(items);
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    setIndex(0);
    setRows(items);
  }, [items]);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (paused || hover || focus || hidden || items.length < 2) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      7000,
    );
    return () => window.clearInterval(id);
  }, [paused, hover, focus, hidden, items.length]);
  const current = rows[index % rows.length];
  if (!current) return null;
  return (
    <section
      className="news-carousel"
      aria-label="Carrossel de notícias"
      aria-roledescription="carrossel"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
    >
      <div
        className="news-slide"
        aria-live={paused || focus ? "polite" : "off"}
      >
        <NewsFeed
          key={current.url}
          items={[current]}
          onItemChange={(url, patch) =>
            setRows((old) =>
              old.map((r) => (r.url === url ? { ...r, ...patch } : r)),
            )
          }
        />
      </div>
      <div className="carousel-controls">
        <button
          className="icon-button"
          aria-label="Notícia anterior"
          onClick={() => setIndex((i) => (i + items.length - 1) % items.length)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {(index % items.length) + 1} / {items.length}
        </span>
        <button
          className="icon-button"
          aria-label={paused ? "Reproduzir notícias" : "Pausar notícias"}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          className="icon-button"
          aria-label="Próxima notícia"
          onClick={() => setIndex((i) => (i + 1) % items.length)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
