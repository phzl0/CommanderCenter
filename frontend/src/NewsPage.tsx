import { useEffect, useState } from "react";
import SourceWizard from "./SourceWizard";
import { RefreshCw } from "lucide-react";
import { api, send } from "./api";
import { formatInstant } from "./userPreferences";
import NewsCarousel from "./NewsCarousel";
import NewsFeed, { type NewsItem } from "./NewsFeed";
import type { Source } from "./Sources";
type NewsResult = {
  items: NewsItem[];
  selected_source?: Source | null;
  available_sources?: Source[];
  source_errors?: { source: string; message: string }[];
};
export default function NewsPage() {
  const [category, setCategory] = useState("Política"),
    [choice, setChoice] = useState(""),
    [wizard, setWizard] = useState(false),
    [sources, setSources] = useState<Source[]>([]),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{ key: string; data: NewsResult } | null>(
      null,
    ),
    [page, setPage] = useState(1);
  const requestKey = category + ":" + choice;
  const data = result?.key === requestKey ? result.data : null;
  const items = data?.items || [];
  const group = sources.filter((s) => s.enabled && s.category === category);
  const categories = [
    ...new Set(sources.filter((s) => s.enabled).map((s) => s.category)),
  ];
  const selectedId =
    choice ||
    data?.selected_source?.id ||
    group.find((s) => s.is_selected)?.id ||
    group.find((s) => s.is_primary)?.id ||
    group[0]?.id ||
    "";
  useEffect(() => {
    let live = true;
    api<Source[]>("/sources/bootstrap", { method: "POST" })
      .then((r) => live && setSources(r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [version]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    api<NewsResult>(
      `/intelligence/news?category=${encodeURIComponent(category)}&source_id=${encodeURIComponent(choice)}&refresh=${version > 0}`,
    )
      .then((r) => {
        if (live) {
          setResult({ key: requestKey, data: r });
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
  }, [category, choice, version]);
  function changeCategory(value: string) {
    setCategory(value);
    setChoice("");
    setPage(1);
  }
  async function choose(value: string) {
    setSaving(true);
    setError("");
    try {
      await api(
        "/sources/preference",
        send("PUT", { category, source_id: value }),
      );
      setChoice(value);
      setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
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
                disabled={saving}
                className={category === c ? "active" : ""}
                onClick={() => changeCategory(c)}
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
              disabled={saving}
              value={
                ["Política", "Futebol", "Economia"].includes(category)
                  ? ""
                  : category
              }
              onChange={(e) => e.target.value && changeCategory(e.target.value)}
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
          <button
            disabled={busy || saving}
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw size={15} />
            {busy ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>
      <div className="news-source-strip">
        <label>
          Fonte de {category.toLocaleLowerCase("pt-BR")}
          <select
            aria-label="Fonte de notícias"
            value={selectedId}
            disabled={saving || !group.length}
            onChange={(e) => choose(e.target.value)}
          >
            {group.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ·{" "}
                {s.is_primary
                  ? "Principal"
                  : s.builtin_key
                    ? "Alternativa"
                    : "Minha fonte"}
              </option>
            ))}
          </select>
        </label>
        <small>
          {group.filter((s) => s.builtin_key).length} fontes padrão · uma por
          vez
        </small>
        {data?.selected_source?.checked_at && (
          <small>
            Última tentativa:{" "}
            {formatInstant(data.selected_source.checked_at + "Z")}
          </small>
        )}
        {items.some((i) => i.stale) && (
          <small>Últimas manchetes disponíveis preservadas.</small>
        )}
      </div>
      {wizard && (
        <SourceWizard
          category={category}
          onClose={() => setWizard(false)}
          onSaved={() => {
            setWizard(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error} Você pode escolher outra fonte acima.
        </p>
      )}
      {busy && (
        <p role="status" className="muted">
          Consultando fonte…
        </p>
      )}
      {items.length ? (
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
        !busy && (
          <div className="panel empty">
            Nenhuma manchete disponível nesta fonte. Selecione uma alternativa
            ou atualize.
          </div>
        )
      )}
    </>
  );
}
