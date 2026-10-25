import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Inbox,
  Plus,
  Star,
  Sun,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { api, send, dateLabel, type Task } from "./api";
import { todayInAccount } from "./userPreferences";
import { dataChanged } from "./feedback";
type Capture = {
  id: string;
  text: string;
  kind: string;
  context: string;
  processed: boolean;
  task_id: string | null;
};
type Summary = {
  completed: number;
  planned: number;
  priorities: { title: string; completed: boolean }[];
};
type DayData = {
  day: string;
  priorities: Task[];
  notes: string;
  closed_at: string | null;
  summary: Summary | null;
  tasks: Task[];
  captures: Capture[];
  archive: Capture[];
  counts: {
    overdue: number;
    due_today: number;
    completed_today: number;
    open: number;
  };
  week: { start: string; end: string; completed: number; minutes: number };
  closed_days: { day: string; notes: string; summary: Summary }[];
};
const contextLabel = (value: string) =>
  value === "personal"
    ? "Pessoal"
    : value === "professional"
      ? "Profissional"
      : "Sem contexto";
const localToday = todayInAccount;
export default function MyDay({ onTasks }: { onTasks: () => void }) {
  const [day, setDay] = useState(localToday),
    [data, setData] = useState<DayData | null>(null),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [archive, setArchive] = useState(false),
    [context, setContext] = useState("all");
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    api<DayData>("/day?day=" + day)
      .then((r) => {
        if (live) {
          setData(r);
          setNotes(r.notes);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [day]);
  async function load() {
    setData(await api<DayData>("/day?day=" + day));
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      dataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePlan(ids = data?.priorities.map((t) => t.id) || []) {
    await api("/day", send("PUT", { day, priority_ids: ids, notes }));
  }
  function focus(task: Task) {
    if (!data) return;
    const ids = data.priorities.map((t) => t.id);
    run(() =>
      savePlan(
        ids.includes(task.id)
          ? ids.filter((i) => i !== task.id)
          : [...ids, task.id],
      ),
    );
  }
  function update(task: Task, patch: Partial<Task>) {
    const {
      title,
      description,
      priority,
      status,
      project_id,
      due_date,
      context,
      goal_id,
      tags,
      recurrence,
    } = task;
    run(() =>
      api(
        "/tasks/" + task.id,
        send("PUT", {
          title,
          description,
          priority,
          status,
          project_id,
          due_date,
          context,
          goal_id,
          tags,
          recurrence,
          ...patch,
        }),
      ),
    );
  }
  function tomorrow(task: Task) {
    const date = new Date(day + "T12:00:00");
    date.setDate(date.getDate() + 1);
    update(task, { due_date: date.toISOString().slice(0, 10) });
  }
  async function capture(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    await run(async () => {
      await api(
        "/day/captures",
        send("POST", {
          text: f.get("text"),
          kind: f.get("kind"),
          context: f.get("context"),
        }),
      );
      form.reset();
    });
  }
  const visibleTasks =
    data?.tasks
      .filter((t) => context === "all" || t.context === context)
      .slice(0, 20) || [];
  const row = (task: Task, priority = false) => (
    <article
      className={"day-task " + (task.status === "completed" ? "done" : "")}
      key={task.id}
    >
      <button
        className="day-check icon-button"
        aria-label={
          (task.status === "completed" ? "Reabrir " : "Concluir ") + task.title
        }
        disabled={busy}
        onClick={() =>
          update(task, {
            status: task.status === "completed" ? "pending" : "completed",
          })
        }
      >
        <Check size={17} />
      </button>
      <div>
        <strong>{task.title}</strong>
        <small>
          {contextLabel(task.context)} ·{" "}
          {task.due_date ? dateLabel(task.due_date) : "Sem prazo"}
          {task.due_date && task.due_date < day && task.status !== "completed"
            ? " · Atrasada"
            : ""}
        </small>
      </div>
      {task.status !== "completed" && (
        <button
          className="quiet day-tomorrow"
          disabled={busy}
          aria-label={"Reagendar para amanhã: " + task.title}
          onClick={() => tomorrow(task)}
        >
          Amanhã <ArrowRight size={12} />
        </button>
      )}
      <button
        className={"icon-button day-pin " + (priority ? "active" : "")}
        aria-label={
          (priority ? "Retirar prioridade: " : "Priorizar: ") + task.title
        }
        disabled={
          busy ||
          !!data?.closed_at ||
          (!priority && (data?.priorities.length || 0) >= 3)
        }
        onClick={() => focus(task)}
      >
        <Star size={17} />
      </button>
    </article>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FOCO · ROTINA · ACOMPANHAMENTO</span>
          <h1>Meu dia</h1>
          <p>Escolha o essencial e transforme pendências em próximos passos.</p>
        </div>
        <label className="day-date">
          Dia de planejamento
          <input
            aria-label="Dia de planejamento"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={day}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value);
            }}
          />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <section className="panel empty">Preparando seu dia…</section>
      ) : (
        <>
          <div className="day-stats">
            <div>
              <span>Prioridades</span>
              <strong>{data.priorities.length} / 3</strong>
            </div>
            <div>
              <span>Vencem neste dia</span>
              <strong>{data.counts.due_today}</strong>
            </div>
            <div>
              <span>Atrasadas</span>
              <strong>{data.counts.overdue}</strong>
            </div>
            <div>
              <span>Concluídas neste dia</span>
              <strong>{data.counts.completed_today}</strong>
            </div>
          </div>
          <section className="panel day-capture">
            <div className="day-panel-heading">
              <Inbox size={19} />
              <div>
                <h2>Captura rápida</h2>
                <p>Registre agora; organize quando fizer sentido.</p>
              </div>
            </div>
            <form onSubmit={capture}>
              <input
                name="text"
                aria-label="O que você quer registrar?"
                placeholder="Uma ideia, uma pendência ou algo para lembrar…"
                required
                maxLength={160}
              />
              <select aria-label="Tipo de captura" name="kind">
                <option value="note">Anotação</option>
                <option value="idea">Ideia</option>
                <option value="task">Pendência</option>
              </select>
              <select name="context" aria-label="Contexto da captura">
                <option value="general">Sem contexto</option>
                <option value="personal">Pessoal</option>
                <option value="professional">Profissional</option>
              </select>
              <button className="primary" disabled={busy}>
                <Plus size={15} />
                Capturar
              </button>
            </form>
          </section>
          <div className="day-grid">
            <section className="panel day-priorities">
              <div className="day-panel-heading">
                <Star size={19} />
                <div>
                  <h2>Minhas três prioridades</h2>
                  <p>
                    {data.closed_at
                      ? "Revisão salva. Reabra para reorganizar as prioridades."
                      : "Use a estrela nas tarefas para escolher seu foco."}
                  </p>
                </div>
              </div>
              {data.priorities.length ? (
                data.priorities.map((t) => row(t, true))
              ) : (
                <div className="empty compact">
                  <Sun size={26} />
                  <p>Selecione até três tarefas na lista abaixo.</p>
                </div>
              )}
            </section>
            <section className="panel day-review">
              <div className="day-panel-heading">
                <Check size={19} />
                <div>
                  <h2>Fechamento do dia</h2>
                  <p>O que avançou e o que merece atenção amanhã?</p>
                </div>
              </div>
              <label>
                Minha revisão
                <textarea
                  aria-label="Minha revisão"
                  rows={4}
                  maxLength={3000}
                  value={notes}
                  disabled={busy || !!data.closed_at}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              {data.summary && (
                <p className="review-result">
                  {data.summary.completed} de {data.summary.planned} prioridades
                  concluídas no fechamento.
                </p>
              )}
              <div className="day-review-actions">
                {data.closed_at ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() => api("/day/reopen", send("POST", { day })))
                    }
                  >
                    Reabrir revisão
                  </button>
                ) : (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => run(() => savePlan())}
                    >
                      Salvar revisão
                    </button>
                    <button
                      className="primary"
                      disabled={busy || day > localToday()}
                      onClick={() =>
                        run(async () => {
                          await savePlan();
                          await api("/day/close", send("POST", { day }));
                        })
                      }
                    >
                      Fechar dia
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
          <div className="day-grid">
            <section className="panel day-agenda">
              <div className="day-panel-heading">
                <CalendarDays size={19} />
                <div>
                  <h2>Tarefas e próximos prazos</h2>
                  <p>
                    Prazos locais; os compromissos de calendário entram em uma
                    próxima etapa.
                  </p>
                </div>
              </div>
              <label className="day-context">
                Contexto das tarefas
                <select
                  aria-label="Contexto das tarefas"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="personal">Pessoal</option>
                  <option value="professional">Profissional</option>
                  <option value="general">Sem contexto</option>
                </select>
              </label>
              {visibleTasks.length ? (
                visibleTasks.map((t) =>
                  row(
                    t,
                    data.priorities.some((p) => p.id === t.id),
                  ),
                )
              ) : (
                <div className="empty compact">
                  Nenhuma tarefa pendente neste recorte.
                </div>
              )}
              <button className="quiet" onClick={onTasks}>
                Gerenciar todas as tarefas <ChevronRight size={14} />
              </button>
              <small className="day-limit">
                Até 20 tarefas nesta lista, entre as 100 pendências carregadas
                por prazo.
              </small>
            </section>
            <section className="panel day-inbox">
              <div className="day-panel-heading">
                <Inbox size={19} />
                <div>
                  <h2>Caixa de entrada</h2>
                  <p>
                    Transforme capturas em tarefas ou mantenha-as como
                    anotações.
                  </p>
                </div>
              </div>
              <div className="segment">
                <button
                  className={!archive ? "active" : ""}
                  onClick={() => setArchive(false)}
                >
                  Para organizar
                </button>
                <button
                  className={archive ? "active" : ""}
                  onClick={() => setArchive(true)}
                >
                  Arquivadas
                </button>
              </div>
              {(archive ? data.archive : data.captures).map((c) => (
                <article className="capture-item" key={c.id}>
                  <strong>{c.text}</strong>
                  <small>
                    {contextLabel(c.context)} ·{" "}
                    {c.kind === "idea"
                      ? "Ideia"
                      : c.kind === "task"
                        ? "Pendência"
                        : "Anotação"}
                    {c.task_id ? " · Convertida em tarefa" : ""}
                  </small>
                  <div>
                    {!c.task_id && (
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            api(
                              "/day/captures/" + c.id + "/task",
                              send("POST", { due_date: day }),
                            ),
                          )
                        }
                      >
                        Virar tarefa
                      </button>
                    )}
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          api(
                            "/day/captures/" + c.id,
                            send("PATCH", { processed: !c.processed }),
                          ),
                        )
                      }
                    >
                      {c.processed ? "Voltar à entrada" : "Arquivar"}
                    </button>
                  </div>
                </article>
              ))}
              {!(archive ? data.archive : data.captures).length && (
                <div className="empty compact">
                  Sua caixa de entrada está em dia.
                </div>
              )}
              <small className="day-limit">
                Até 50 capturas recentes por lista.
              </small>
            </section>
          </div>
          <section className="panel day-week">
            <div className="day-panel-heading">
              <Sun size={19} />
              <div>
                <h2>Revisão de sete dias</h2>
                <p>
                  {dateLabel(data.week.start)} a {dateLabel(data.week.end)}
                </p>
              </div>
            </div>
            <div className="day-week-stats">
              <span>
                <strong>{data.week.completed}</strong> tarefas atualmente
                concluídas no período
              </span>
              <span>
                <strong>{data.week.minutes}</strong> minutos pessoais
                registrados
              </span>
              <span>
                <strong>{data.closed_days.length}</strong> dias revisados
              </span>
            </div>
            {data.closed_days.map((d) => (
              <article className="closed-day" key={d.day}>
                <strong>
                  {dateLabel(d.day)} · {d.summary.completed}/{d.summary.planned}{" "}
                  prioridades
                </strong>
                {d.notes && <p>{d.notes}</p>}
              </article>
            ))}
            <small className="day-limit">
              O fechamento preserva a situação das prioridades naquele momento.
              Os demais totais refletem os registros atuais.
            </small>
          </section>
        </>
      )}
    </>
  );
}
