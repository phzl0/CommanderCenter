import { useEffect, useState } from "react";
import {
  Plus,
  Rss,
  ExternalLink,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Bookmark,
} from "lucide-react";
import { api, send } from "./api";
import { confirmAction, dataChanged } from "./feedback";
import NewsFeed, { type NewsItem } from "./NewsFeed";
export type Source = {
  id: string;
  name: string;
  category: string;
  url: string;
  kind: string;
  enabled: boolean;
  checked_at: string | null;
  last_error: string | null;
};
type Preview = {
  resolved_url: string;
  title: string;
  items: NewsItem[];
  candidates: string[];
};
export default function Sources() {
  const [sources, setSources] = useState<Source[]>([]),
    [mode, setMode] = useState<"sources" | "saved" | "read">("sources"),
    [articles, setArticles] = useState<NewsItem[]>([]),
    [editing, setEditing] = useState<Source | null | undefined>(undefined),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  async function load() {
    setSources(await api<Source[]>("/sources/bootstrap", { method: "POST" }));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const changed = () => load().catch((e) => setError(e.message));
    window.addEventListener("cc-data-changed", changed);
    return () => window.removeEventListener("cc-data-changed", changed);
  }, []);
  useEffect(() => {
    if (mode === "sources") return;
    const loadArticles = () =>
      api<NewsItem[]>("/sources/articles?mode=" + mode)
        .then(setArticles)
        .catch((e) => setError(e.message));
    loadArticles();
    window.addEventListener("cc-reading-changed", loadArticles);
    return () => window.removeEventListener("cc-reading-changed", loadArticles);
  }, [mode]);
  function edit(source: Source | null) {
    setEditing(source);
    setUrl(source?.url || "");
    setPreview(null);
    setError("");
  }
  async function test() {
    setBusy(true);
    setError("");
    try {
      setPreview(await api<Preview>("/sources/preview", send("POST", { url })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        "/sources" + (editing ? "/" + editing.id : ""),
        send(editing ? "PUT" : "POST", {
          name: form.get("name"),
          category: form.get("category"),
          url: preview?.resolved_url || url,
          enabled: form.get("enabled") === "on",
        }),
      );
      setEditing(undefined);
      await load();
      dataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(source: Source) {
    setBusy(true);
    try {
      const { name, category, url, enabled } = source;
      await api(
        "/sources/" + source.id,
        send("PUT", { name, category, url, enabled: !enabled }),
      );
      await load();
      dataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(source: Source) {
    if (
      !(await confirmAction(
        "Remover esta fonte? Você poderá desfazer por dez minutos. Os arquivos e registros pessoais são mantidos.",
      ))
    )
      return;
    setBusy(true);
    try {
      await api("/sources/" + source.id, { method: "DELETE" });
      await load();
      dataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = sources.filter((s) =>
    (s.name + " " + s.category)
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INFORMAÇÃO COM ORIGEM</span>
          <h1>Fontes</h1>
          <p>Conecte uma vez. Use em quantos painéis fizer sentido.</p>
        </div>
        <button className="primary" onClick={() => edit(null)}>
          <Plus size={16} />
          Adicionar fonte
        </button>
      </div>
      <div className="sources-toolbar">
        <div className="segment">
          {[
            { id: "sources", name: "Minhas fontes" },
            { id: "saved", name: "Ler depois" },
            { id: "read", name: "Já lidas" },
          ].map((t) => (
            <button
              key={t.id}
              className={mode === t.id ? "active" : ""}
              onClick={() => {
                setMode(t.id as typeof mode);
                setError("");
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
        {mode === "sources" && (
          <div className="search">
            <Search size={15} />
            <input
              aria-label="Buscar fontes"
              placeholder="Fonte ou categoria…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>
      {error && editing === undefined && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {mode === "sources" ? (
        <>
          <div className="source-guidance">
            <Rss size={19} />
            <div>
              <strong>
                Três fontes para começar, liberdade para explorar.
              </strong>
              <p>
                Agência Brasil, G1 e IBGE. Acrescente RSS de futebol, jogos,
                tecnologia ou outro tema. Um link comum será testado para
                localizar o feed.
              </p>
            </div>
          </div>
          <div className="source-grid">
            {filtered.map((s) => (
              <article className="panel source-card" key={s.id}>
                <div className="source-heading">
                  <span className="widget-symbol news">
                    <Rss size={19} />
                  </span>
                  <div>
                    <h2>{s.name}</h2>
                    <span className="badge">{s.category}</span>
                  </div>
                  <button
                    className={"source-toggle " + (s.enabled ? "on" : "")}
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={"Ativar " + s.name}
                    disabled={busy}
                    onClick={() => toggle(s)}
                  >
                    <i />
                  </button>
                </div>
                <a
                  className="source-url"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.url}
                  <ExternalLink size={12} />
                </a>
                <div
                  className={"source-health " + (s.last_error ? "failed" : "")}
                >
                  {s.last_error ? (
                    <AlertCircle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  <span>
                    {s.last_error ||
                      (s.checked_at
                        ? "Última consulta: " +
                          new Date(s.checked_at + "Z").toLocaleString("pt-BR")
                        : "Aguardando primeira consulta")}
                  </span>
                </div>
                <div className="source-actions">
                  <button className="quiet" onClick={() => edit(s)}>
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button
                    className="quiet danger"
                    disabled={busy}
                    onClick={() => remove(s)}
                  >
                    <Trash2 size={14} />
                    Remover
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="muted sources-footnote">
            Limite de 30 fontes por conta e até 6 fontes por painel. As
            categorias são livres; crie uma ao editar ou adicionar uma fonte.
          </p>
        </>
      ) : articles.length ? (
        <section className="panel reading-list">
          <NewsFeed items={articles} />
        </section>
      ) : (
        <section className="panel empty">
          <Bookmark size={30} />
          <h3>
            {mode === "saved"
              ? "Sua lista de leitura começa aqui"
              : "Nenhuma notícia lida ainda"}
          </h3>
          <p>Use os botões do radar para organizar suas leituras.</p>
        </section>
      )}
      {editing !== undefined && (
        <div className="modal-backdrop">
          <section
            className="modal source-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">SUA CURADORIA PESSOAL</span>
                <h2 id="source-title">
                  {editing ? "Editar fonte" : "Adicionar fonte"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar fonte"
                onClick={() => setEditing(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Nome da fonte
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing?.name || ""}
                />
              </label>
              <label>
                Categoria
                <input
                  name="category"
                  required
                  maxLength={80}
                  list="source-categories"
                  placeholder="Futebol, jogos, economia…"
                  defaultValue={editing?.category || ""}
                />
                <datalist id="source-categories">
                  {[
                    ...new Set([
                      ...sources.map((s) => s.category),
                      "Futebol",
                      "Jogos",
                      "Política",
                      "Clima",
                      "Tecnologia",
                    ]),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Site ou link RSS
                <input
                  type="url"
                  aria-label="Site ou link RSS"
                  required
                  maxLength={2048}
                  placeholder="https://site.com/feed"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <button type="button" disabled={busy || !url} onClick={test}>
                <Search size={15} />
                {busy ? "Consultando…" : "Testar e visualizar"}
              </button>
              {preview && (
                <div className="source-preview">
                  <strong>
                    <CheckCircle2 size={16} />
                    Feed encontrado: {preview.title || "RSS"}
                  </strong>
                  <small>{preview.resolved_url}</small>
                  {preview.items.map((i) => (
                    <p key={i.url}>{i.title}</p>
                  ))}
                </div>
              )}
              <label className="checkbox-label">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={editing?.enabled ?? true}
                />
                Fonte ativa
              </label>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={
                    busy || (!preview && (!editing || url !== editing.url))
                  }
                >
                  Salvar fonte
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
