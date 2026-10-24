import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  ArrowRight,
  Check,
  Folder,
  ClipboardList,
  Clock3,
} from "lucide-react";
import {
  api,
  send,
  labels,
  dateLabel,
  timeLabel,
  type Project,
  type Task,
  type Activity,
  type Page,
} from "./api";
export type Section = "projects" | "tasks" | "activities";
type RecordItem = Project | Task | Activity;
const names = {
  projects: "Projetos",
  tasks: "Tarefas",
  activities: "Atividades",
};
export function Management({ section }: { section: Section }) {
  const [items, setItems] = useState<RecordItem[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const [editing, setEditing] = useState<RecordItem | null | undefined>(
      undefined,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<Page<RecordItem>>(
      `/${section}?offset=${offset}&limit=20&q=${encodeURIComponent(query)}&status=${status}`,
    )
      .then((p) => {
        if (live) {
          setItems(p.items);
          setTotal(p.total);
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [section, offset, query, status, version]);
  useEffect(() => {
    Promise.all([
      api<Page<Project>>("/projects?limit=1000"),
      api<Page<Task>>("/tasks?limit=1000"),
    ])
      .then(([p, t]) => {
        setProjects(p.items);
        setTasks(t.items);
      })
      .catch((e) => setError(e.message));
  }, [version]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    let body: Record<string, unknown> = {};
    if (section === "projects")
      body = {
        name: f.get("name"),
        description: f.get("description"),
        status: f.get("status"),
        due_date: f.get("due_date") || null,
      };
    if (section === "tasks")
      body = {
        title: f.get("title"),
        description: f.get("description"),
        status: f.get("status"),
        priority: f.get("priority"),
        project_id: f.get("project_id") || null,
        due_date: f.get("due_date") || null,
      };
    if (section === "activities")
      body = {
        description: f.get("description"),
        project_id: f.get("project_id") || null,
        task_id: f.get("task_id") || null,
        occurred_at: new Date(String(f.get("occurred_at"))).toISOString(),
      };
    try {
      await api(
        `/${section}${editing ? "/" + editing.id : ""}`,
        send(editing ? "PUT" : "POST", body),
      );
      setEditing(undefined);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function complete(task: Task) {
    setBusy(true);
    setError("");
    try {
      const { title, description, status, priority, project_id, due_date } =
        task;
      await api(
        "/tasks/" + task.id,
        send("PUT", {
          title,
          description,
          status: status === "completed" ? "pending" : "completed",
          priority,
          project_id,
          due_date,
        }),
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const row = editing as (Project & Task & Activity) | null | undefined;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ESPAÇO DE TRABALHO</span>
          <h1>{names[section]}</h1>
          <p>
            {section === "projects"
              ? "Organize objetivos e acompanhe suas entregas."
              : section === "tasks"
                ? "Priorize o que precisa acontecer."
                : "Mantenha um registro do trabalho realizado."}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setError("");
            setEditing(null);
          }}
        >
          <Plus size={17} />{" "}
          {section === "projects"
            ? "Novo projeto"
            : section === "tasks"
              ? "Nova tarefa"
              : "Registrar atividade"}
        </button>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="panel">
        <div className="toolbar">
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              setQuery(search);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Buscar"
              placeholder="Buscar pelo nome ou descrição…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button>Buscar</button>
          </form>
          {section !== "activities" && (
            <select
              aria-label="Filtrar situação"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas as situações</option>
              {(section === "projects"
                ? ["active", "paused", "completed", "archived"]
                : ["pending", "in_progress", "completed"]
              ).map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </select>
          )}
        </div>
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="empty">
            <ClipboardList size={32} />
            <h3>Nenhum registro encontrado</h3>
            <p>Crie seu primeiro registro ou ajuste a busca.</p>
          </div>
        ) : (
          <div className="record-list">
            {items.map((item) => {
              const r = item as Project & Task & Activity;
              return (
                <article className="record" key={r.id}>
                  <div
                    className={
                      "record-icon " +
                      (section === "tasks" && r.status === "completed"
                        ? "done"
                        : "")
                    }
                  >
                    {section === "tasks" ? (
                      <button
                        className="icon-button"
                        title={
                          r.status === "completed"
                            ? "Reabrir tarefa"
                            : "Concluir tarefa"
                        }
                        disabled={busy}
                        onClick={() => complete(r)}
                      >
                        {r.status === "completed" ? (
                          <Check size={19} />
                        ) : (
                          <ClipboardList size={19} />
                        )}
                      </button>
                    ) : section === "projects" ? (
                      <Folder size={20} />
                    ) : (
                      <Clock3 size={20} />
                    )}
                  </div>
                  <div className="record-body">
                    <h3>{r.name || r.title || r.description}</h3>
                    {section !== "activities" && r.description && (
                      <p>{r.description}</p>
                    )}
                    <div className="meta">
                      {r.status && (
                        <span className={"badge " + r.status}>
                          {labels[r.status]}
                        </span>
                      )}
                      {r.priority && (
                        <span className={"priority " + r.priority}>
                          {labels[r.priority]} prioridade
                        </span>
                      )}
                      {r.project_id && (
                        <span>
                          {projects.find((p) => p.id === r.project_id)?.name ||
                            "Projeto"}
                        </span>
                      )}
                      <span>
                        {section === "activities"
                          ? timeLabel(r.occurred_at)
                          : dateLabel(r.due_date)}
                      </span>
                      {r.origin && (
                        <span className="badge">{labels[r.origin]}</span>
                      )}
                    </div>
                  </div>
                  {r.origin !== "automatic" && (
                    <button
                      className="quiet"
                      onClick={() => {
                        setEditing(item);
                        setError("");
                      }}
                    >
                      Editar <ArrowRight size={15} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="pagination">
          <span>{total} registros</span>
          <div>
            <button
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Anterior
            </button>
            <span>{Math.floor(offset / 20) + 1}</span>
            <button
              disabled={offset + 20 >= total || loading}
              onClick={() => setOffset(offset + 20)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
      {editing !== undefined && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(undefined);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <h2 id="editor-title">
              {editing
                ? "Editar registro"
                : section === "projects"
                  ? "Novo projeto"
                  : section === "tasks"
                    ? "Nova tarefa"
                    : "Registrar atividade"}
            </h2>
            <form onSubmit={save}>
              {section === "projects" && (
                <label>
                  Nome
                  <input
                    name="name"
                    required
                    maxLength={160}
                    defaultValue={row?.name}
                  />
                </label>
              )}
              {section === "tasks" && (
                <label>
                  Título
                  <input
                    name="title"
                    required
                    maxLength={160}
                    defaultValue={row?.title}
                  />
                </label>
              )}
              <label>
                Descrição
                <textarea
                  name="description"
                  required={section === "activities"}
                  maxLength={10000}
                  rows={3}
                  defaultValue={row?.description}
                />
              </label>
              {section !== "projects" && (
                <label>
                  Projeto
                  <select
                    aria-label="Projeto"
                    name="project_id"
                    defaultValue={row?.project_id || ""}
                  >
                    <option value="">Sem projeto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {section === "activities" ? (
                <>
                  <label>
                    Tarefa relacionada
                    <select
                      aria-label="Tarefa relacionada"
                      name="task_id"
                      defaultValue={row?.task_id || ""}
                    >
                      <option value="">Sem tarefa</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Data e hora
                    <input
                      name="occurred_at"
                      type="datetime-local"
                      required
                      defaultValue={(() => {
                        const d = row?.occurred_at
                          ? new Date(row.occurred_at + "Z")
                          : new Date();
                        return new Date(
                          d.getTime() - d.getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16);
                      })()}
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="form-grid">
                    <label>
                      Situação
                      <select
                        aria-label="Situação"
                        name="status"
                        defaultValue={
                          row?.status ||
                          (section === "projects" ? "active" : "pending")
                        }
                      >
                        {(section === "projects"
                          ? ["active", "paused", "completed", "archived"]
                          : ["pending", "in_progress", "completed"]
                        ).map((s) => (
                          <option key={s} value={s}>
                            {labels[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Prazo
                      <input
                        type="date"
                        name="due_date"
                        defaultValue={row?.due_date || ""}
                      />
                    </label>
                  </div>
                  {section === "tasks" && (
                    <label>
                      Prioridade
                      <select
                        aria-label="Prioridade"
                        name="priority"
                        defaultValue={row?.priority || "medium"}
                      >
                        {["low", "medium", "high"].map((s) => (
                          <option key={s} value={s}>
                            {labels[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
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
                <button className="primary" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
