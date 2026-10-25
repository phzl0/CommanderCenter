import { confirmAction } from "./feedback";
import { useEffect, useState } from "react";
import { X, Trash2, Pencil, Plus } from "lucide-react";
import { api, send, dateLabel } from "./api";
import { formatValue } from "./intelligenceTypes";
type Entry = {
  id: string;
  entry_date: string;
  label?: string;
  minutes?: number;
  description?: string;
  category?: string;
  direction?: string;
  amount_cents?: number;
};
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
export default function QuickRecords({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"personal" | "finance">("personal"),
    [entries, setEntries] = useState<Entry[]>([]),
    [editing, setEditing] = useState<Entry | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setEntries([]);
    api<Entry[]>("/intelligence/entries/" + kind)
      .then((r) => live && setEntries(r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [kind, version]);
  useEffect(() => {
    const changed = () => setVersion((v) => v + 1);
    window.addEventListener("cc-data-changed", changed);
    return () => window.removeEventListener("cc-data-changed", changed);
  }, []);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    const data =
      kind === "personal"
        ? {
            label: f.get("label"),
            minutes: Number(f.get("minutes")),
            entry_date: f.get("entry_date"),
          }
        : {
            description: f.get("description"),
            category: f.get("category"),
            direction: f.get("direction"),
            amount: String(f.get("amount")),
            entry_date: f.get("entry_date"),
          };
    try {
      await api(
        "/intelligence/entries/" + kind + (editing ? "/" + editing.id : ""),
        send(editing ? "PUT" : "POST", data),
      );
      setEditing(null);
      setVersion((v) => v + 1);
      setMessage("Registro salvo. Seus gráficos foram atualizados.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(entry: Entry) {
    if (
      !(await confirmAction(
        "Excluir este lançamento? O gráfico será recalculado.",
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/intelligence/entries/${kind}/${entry.id}`, {
        method: "DELETE",
      });
      if (editing?.id === entry.id) setEditing(null);
      setVersion((v) => v + 1);
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
        className="modal records-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="records-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">ALIMENTE SEUS INDICADORES</span>
            <h2 id="records-title">Registro rápido</h2>
          </div>
          <button
            aria-label="Fechar registros"
            className="icon-button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="segment" role="group" aria-label="Tipo de registro">
          {(["personal", "finance"] as const).map((k) => (
            <button
              key={k}
              disabled={busy}
              className={kind === k ? "active" : ""}
              onClick={() => {
                setKind(k);
                setEditing(null);
                setError("");
                setMessage("");
              }}
            >
              {k === "personal" ? "Atividade pessoal" : "Financeiro"}
            </button>
          ))}
        </div>
        <div className="records-grid">
          <form
            key={kind + "-" + (editing?.id || "new") + "-" + version}
            onSubmit={save}
          >
            <h3>{editing ? "Editar registro" : "Novo registro"}</h3>
            {kind === "personal" ? (
              <>
                <label>
                  Atividade
                  <input
                    name="label"
                    placeholder="Estudo, exercício, leitura…"
                    required
                    maxLength={100}
                    defaultValue={editing?.label}
                  />
                </label>
                <label>
                  Tempo em minutos
                  <input
                    type="number"
                    name="minutes"
                    required
                    min={1}
                    max={1440}
                    step={1}
                    defaultValue={editing?.minutes || 30}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Descrição
                  <input
                    name="description"
                    placeholder="Salário, mercado, transporte…"
                    required
                    maxLength={160}
                    defaultValue={editing?.description}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Tipo
                    <select
                      name="direction"
                      aria-label="Tipo financeiro"
                      defaultValue={editing?.direction || "expense"}
                    >
                      <option value="expense">Despesa</option>
                      <option value="income">Receita</option>
                    </select>
                  </label>
                  <label>
                    Valor em reais
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max="1000000000"
                      step="0.01"
                      required
                      defaultValue={
                        editing?.amount_cents
                          ? editing.amount_cents / 100
                          : undefined
                      }
                    />
                  </label>
                </div>
                <label>
                  Categoria
                  <input
                    name="category"
                    placeholder="Moradia, alimentação, trabalho…"
                    maxLength={80}
                    required
                    defaultValue={editing?.category}
                  />
                </label>
              </>
            )}
            <label>
              Data
              <input
                name="entry_date"
                type="date"
                required
                defaultValue={editing?.entry_date || today()}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="success" role="status">
                {message}
              </div>
            )}
            <div className="modal-actions">
              {editing && (
                <button type="button" onClick={() => setEditing(null)}>
                  Novo registro
                </button>
              )}
              <button className="primary" disabled={busy}>
                <Plus size={15} />
                {busy ? "Salvando…" : "Salvar registro"}
              </button>
            </div>
          </form>
          <section className="entry-history">
            <h3>
              Últimos registros <span>até 100</span>
            </h3>
            {entries.length === 0 ? (
              <div className="empty compact">
                Seus registros aparecerão aqui.
              </div>
            ) : (
              entries.map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.label || entry.description}</strong>
                    <span>
                      {dateLabel(entry.entry_date)}
                      {entry.category ? " · " + entry.category : ""}
                    </span>
                    <b
                      className={
                        entry.direction === "income" ? "income" : "expense"
                      }
                    >
                      {kind === "personal"
                        ? `${entry.minutes} min`
                        : `${entry.direction === "income" ? "+" : "−"} ${formatValue((entry.amount_cents || 0) / 100, "R$")}`}
                    </b>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={"Editar " + (entry.label || entry.description)}
                    disabled={busy}
                    onClick={() => {
                      setEditing(entry);
                      setMessage("");
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={"Excluir " + (entry.label || entry.description)}
                    disabled={busy}
                    onClick={() => remove(entry)}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
