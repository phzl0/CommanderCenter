import { useEffect, useState } from "react";
import { Plus, Target, X } from "lucide-react";
import { api, send, dateLabel } from "./api";
export type Goal = {
  id: string;
  title: string;
  description: string;
  context: string;
  metric: "tasks" | "minutes" | "manual";
  target: number;
  manual_value: number;
  due_date: string | null;
  status: string;
  progress: number;
  percentage: number;
  reached: boolean;
};
export default function Goals() {
  const [items, setItems] = useState<Goal[]>([]),
    [editing, setEditing] = useState<Goal | null | undefined>(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [values, setValues] = useState<Record<string, number>>({}),
    [showArchive, setShowArchive] = useState(false);
  async function load() {
    setItems(await api<Goal[]>("/planning/goals"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      await api(
        "/planning/goals" + (editing ? "/" + editing.id : ""),
        send(editing ? "PUT" : "POST", {
          title: f.get("title"),
          description: f.get("description"),
          context: f.get("context"),
          metric: f.get("metric"),
          target: Number(f.get("target")),
          due_date: f.get("due_date") || null,
          status: editing?.status || "active",
        }),
      );
      setEditing(undefined);
    });
  }
  function status(goal: Goal) {
    const { title, description, context, metric, target, due_date } = goal;
    run(() =>
      api(
        "/planning/goals/" + goal.id,
        send("PUT", {
          title,
          description,
          context,
          metric,
          target,
          due_date,
          status: goal.status === "archived" ? "active" : "archived",
        }),
      ),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AÇÕES CONECTADAS A OBJETIVOS</span>
          <h1>Metas</h1>
          <p>Acompanhe entregas, tempo dedicado ou progresso manual.</p>
        </div>
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          Nova meta
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={showArchive}
          onChange={(e) => setShowArchive(e.target.checked)}
        />
        Mostrar metas arquivadas
      </label>
      <div className="goals-grid">
        {items
          .filter((g) => showArchive || g.status !== "archived")
          .map((g) => (
            <article className="panel goal-card" key={g.id}>
              <div className="goal-heading">
                <Target size={20} />
                <h2>{g.title}</h2>
                <span className="badge">
                  {g.context === "personal"
                    ? "Pessoal"
                    : g.context === "professional"
                      ? "Profissional"
                      : "Geral"}
                </span>
              </div>
              <p>
                {g.description ||
                  "Vincule ações para acompanhar seu progresso."}
              </p>
              <strong className="goal-progress-number">
                {g.progress.toLocaleString("pt-BR")} /{" "}
                {g.target.toLocaleString("pt-BR")}{" "}
                <small>
                  {g.metric === "tasks"
                    ? "tarefas"
                    : g.metric === "minutes"
                      ? "minutos"
                      : "unidades"}
                </small>
              </strong>
              <div
                className="goal-progress"
                role="progressbar"
                aria-label={"Progresso de " + g.title}
                aria-valuenow={g.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: g.percentage + "%" }} />
              </div>
              <small>
                {g.reached ? "Objetivo atingido · " : ""}
                {g.status === "archived" ? "Arquivada · " : ""}
                {dateLabel(g.due_date)}
              </small>
              {g.metric === "manual" && (
                <div className="manual-progress">
                  <input
                    aria-label={"Progresso manual de " + g.title}
                    type="number"
                    min={0}
                    max={1000000000}
                    value={values[g.id] ?? g.manual_value}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [g.id]: Number(e.target.value),
                      }))
                    }
                  />
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        api(
                          "/planning/goals/" + g.id + "/progress",
                          send("PUT", {
                            value: values[g.id] ?? g.manual_value,
                          }),
                        ),
                      )
                    }
                  >
                    Atualizar progresso
                  </button>
                </div>
              )}
              <div className="goal-actions">
                <button className="quiet" onClick={() => setEditing(g)}>
                  Editar meta
                </button>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => status(g)}
                >
                  {g.status === "archived" ? "Reativar" : "Arquivar meta"}
                </button>
              </div>
            </article>
          ))}
      </div>
      {items.length === 0 && (
        <section className="panel empty">
          <Target size={32} />
          <h2>Qual resultado você quer alcançar?</h2>
          <p>Crie uma meta e vincule tarefas ou registros de tempo.</p>
        </section>
      )}
      <p className="muted planning-footnote">
        Tarefas concluídas e minutos vinculados atualizam o progresso. Reabrir
        uma tarefa ou excluir um registro recalcula a meta. Até 100 metas por
        conta.
      </p>
      {editing !== undefined && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-title"
          >
            <div className="dialog-heading">
              <h2 id="goal-title">{editing ? "Editar meta" : "Nova meta"}</h2>
              <button
                className="icon-button"
                aria-label="Fechar meta"
                onClick={() => setEditing(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Título da meta
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={editing?.title}
                />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  maxLength={2000}
                  defaultValue={editing?.description}
                />
              </label>
              <div className="form-grid">
                <label>
                  Contexto da meta
                  <select
                    name="context"
                    defaultValue={editing?.context || "personal"}
                  >
                    <option value="personal">Pessoal</option>
                    <option value="professional">Profissional</option>
                    <option value="general">Geral</option>
                  </select>
                </label>
                <label>
                  Cálculo da meta
                  <select
                    name="metric"
                    defaultValue={editing?.metric || "tasks"}
                  >
                    <option value="tasks">Tarefas concluídas</option>
                    <option value="minutes">Minutos registrados</option>
                    <option value="manual">Progresso manual</option>
                  </select>
                </label>
                <label>
                  Valor alvo
                  <input
                    name="target"
                    type="number"
                    min={1}
                    max={1000000000}
                    required
                    defaultValue={editing?.target || 1}
                  />
                </label>
                <label>
                  Prazo da meta
                  <input
                    name="due_date"
                    type="date"
                    defaultValue={editing?.due_date || ""}
                  />
                </label>
              </div>
              <p className="muted">
                Vincule tarefas na edição da tarefa, ou registros pessoais em
                Registrar dados.
              </p>
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setEditing(undefined)}>
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  Salvar meta
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
