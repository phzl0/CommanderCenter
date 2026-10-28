import { useState } from "react";
import { X, ArrowLeft } from "lucide-react";
import { api, send } from "./api";
import type { NewsItem } from "./NewsFeed";
type Preview = {
  resolved_url: string;
  title: string;
  kind?: string;
  items: NewsItem[];
};
export default function SourceWizard({
  category = "Política",
  onClose,
  onSaved,
}: {
  category?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(1),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [name, setName] = useState(""),
    [topic, setTopic] = useState(category),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function inspect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<Preview>(
        "/sources/preview",
        send("POST", {
          url: url.includes("://") ? url.trim() : "https://" + url.trim(),
        }),
      );
      setPreview(r);
      setName(r.title);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/sources",
        send("POST", {
          url: preview.resolved_url,
          name,
          category: topic,
          enabled: true,
        }),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-wizard-title"
      >
        <div className="dialog-heading">
          <div>
            <h2 id="source-wizard-title">Adicionar fonte · avançado</h2>
            <small>
              Etapa {step} de 3 ·{" "}
              {step === 1
                ? "Cole o link"
                : step === 2
                  ? "Escolha a categoria"
                  : "Confira as manchetes"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Fechar cadastro de fonte"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {step === 1 ? (
          <form onSubmit={inspect}>
            <label>
              Site, página da categoria ou RSS
              <input
                aria-label="Link da fonte"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                required
                maxLength={2048}
                placeholder="https://site.com.br/futebol"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <p className="muted">
              Tentaremos localizar o feed ou ler as manchetes da página. Sites
              com bloqueio ou conteúdo apenas em JavaScript podem exigir outro
              link.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Identificando fonte…" : "Identificar fonte"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={
              step === 2
                ? (e) => {
                    e.preventDefault();
                    setStep(3);
                  }
                : save
            }
          >
            {step === 2 ? (
              <>
                <label>
                  Nome da fonte
                  <input
                    aria-label="Nome da nova fonte"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Categoria
                  <input
                    aria-label="Categoria da nova fonte"
                    required
                    maxLength={80}
                    list="wizard-categories"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                  <datalist id="wizard-categories">
                    {[
                      "Política",
                      "Futebol",
                      "Economia",
                      "Tecnologia",
                      "Jogos",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </datalist>
                </label>
                <small>
                  {preview?.kind === "auto"
                    ? "Leitura de manchetes da página"
                    : "Feed de notícias identificado"}
                </small>
              </>
            ) : (
              <div className="wizard-preview">
                <strong>
                  {name} · {topic}
                </strong>
                <small>{preview?.resolved_url}</small>
                {preview?.items.map((i) => (
                  <article key={i.url}>
                    <h3>{i.title}</h3>
                    {i.description && <p>{i.description.slice(0, 180)}</p>}
                  </article>
                ))}
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft size={14} />
                Voltar
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Salvando…"
                  : step === 2
                    ? "Conferir prévia"
                    : "Adicionar fonte"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
