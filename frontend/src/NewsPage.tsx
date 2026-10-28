import { useEffect, useState } from "react";
import SourceWizard from "./SourceWizard";
import { RefreshCw } from "lucide-react";
import { api } from "./api";
import NewsCarousel from "./NewsCarousel";
import NewsFeed, { type NewsItem } from "./NewsFeed";
import type { Source } from "./Sources";
export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]),
    [categories, setCategories] = useState<string[]>([]),
    [category, setCategory] = useState("Política"),
    [wizard, setWizard] = useState(false),
    [sources, setSources] = useState<Source[]>([]),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<Source[]>("/sources/bootstrap", { method: "POST" })
      .then((r) => {
        if (live) {
          setSources(r);
          setCategories([
            ...new Set(r.filter((s) => s.enabled).map((s) => s.category)),
          ]);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    api<{
      items: NewsItem[];
      source_errors?: { source: string; message: string }[];
    }>(
      `/intelligence/news?category=${encodeURIComponent(category)}&refresh=${version > 0}`,
    )
      .then((r) => {
        if (live) {
          setItems(r.items);
          if (r.source_errors?.length)
            setError(
              r.source_errors
                .map((s) => s.source + ": " + s.message)
                .join(" · "),
            );
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [category, version]);
  const [page, setPage] = useState(1);
  const headlines = items.slice(5),
    pages = Math.max(1, Math.ceil(headlines.length / 8));
  return (
    <>
      <div className="page-heading">
        <h1>Notícias</h1>
        <div className="agenda-actions">
          <div
            className="segment news-categories"
            role="group"
            aria-label="Categoria de notícias"
          >
            {["Política", "Futebol", "Economia"].map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={() => {
                  setCategory(c);
                  setPage(1);
                }}
              >
                {c}
              </button>
            ))}
          </div>
          {categories.some(
            (c) => !["Política", "Futebol", "Economia"].includes(c),
          ) && (
            <select
              aria-label="Outras categorias"
              value={
                ["Política", "Futebol", "Economia"].includes(category)
                  ? ""
                  : category
              }
              onChange={(e) => {
                if (e.target.value) {
                  setCategory(e.target.value);
                  setPage(1);
                }
              }}
            >
              <option value="">Outros temas</option>
              {categories
                .filter((c) => !["Política", "Futebol", "Economia"].includes(c))
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          )}
          <button onClick={() => setWizard(true)}>
            Adicionar fonte · avançado
          </button>
          <button disabled={busy} onClick={() => setVersion((v) => v + 1)}>
            <RefreshCw size={15} />
            Atualizar
          </button>
        </div>
      </div>
      <div className="news-source-strip">
        {sources
          .filter((s) => s.category === category && s.builtin_key)
          .map((s) => (
            <span key={s.id}>{s.name}</span>
          ))}
      </div>
      {wizard && (
        <SourceWizard
          category={category}
          onClose={() => setWizard(false)}
          onSaved={() => {
            setWizard(false);
            setVersion((v) => v + 1);
            api<Source[]>("/sources/bootstrap", { method: "POST" })
              .then((r) => {
                setSources(r);
                setCategories([...new Set(r.map((s) => s.category))]);
              })
              .catch((e) => setError(e.message));
          }}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {busy ? (
        <div className="panel empty">Carregando notícias…</div>
      ) : items.length ? (
        <>
          <div className="news-hero">
            <NewsCarousel items={items.slice(0, 5)} />
          </div>
          {headlines.length > 0 && (
            <section className="panel headlines">
              <h2>Manchetes</h2>
              <NewsFeed items={headlines.slice((page - 1) * 8, page * 8)} />
              {pages > 1 && (
                <div className="pagination">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    {page} / {pages}
                  </span>
                  <button
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <div className="panel empty">Nenhuma notícia. Confira suas fontes.</div>
      )}
    </>
  );
}
