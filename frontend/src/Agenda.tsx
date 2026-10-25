import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { api, send, dateLabel } from "./api";
import { confirmAction } from "./feedback";
import {
  todayInAccount,
  formatInstant,
  getPreferences,
} from "./userPreferences";
type Item = {
  id: string;
  title: string;
  notes?: string;
  start_at: string;
  end_at: string;
  source: "local" | "google";
  all_day?: boolean;
  link?: string;
  context?: string;
  kind?: "appointment" | "todo" | "notice";
  completed?: boolean;
  reminder_minutes?: number | null;
  notify_system?: boolean;
  notify_email?: boolean;
  email_error?: string;
  email_sent_at?: string;
};
type Result = {
  events: Item[];
  tasks: { id: string; title: string }[];
  errors: string[];
  limited: boolean;
};
const kinds = { appointment: "Compromisso", todo: "Afazer", notice: "Aviso" };
function localTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getPreferences().timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = (k: string) => parts.find((v) => v.type === k)!.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}
function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export default function Agenda({
  onConnections,
  initialDay,
}: {
  onConnections: () => void;
  initialDay?: string;
}) {
  const [day, setDay] = useState(initialDay || todayInAccount()),
    [month, setMonth] = useState(() =>
      (initialDay || todayInAccount()).slice(0, 7),
    ),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [data, setData] = useState<Result | null>(null),
    [editing, setEditing] = useState<Item | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [google, setGoogle] = useState(false),
    [connected, setConnected] = useState(false),
    [emailReady, setEmailReady] = useState(false);
  const [year, monthNumber] = month.split("-").map(Number),
    m = monthNumber - 1;
  useEffect(() => {
    let live = true;
    Promise.all([
      api<{ google?: { connected: boolean } }>("/integrations"),
      api<{ email_configured: boolean }>("/planning/reminders/status"),
    ])
      .then(([i, s]) => {
        if (live) {
          setConnected(!!i.google?.connected);
          setEmailReady(s.email_configured);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setError("");
    setData(null);
    api<Result>(`/planning/agenda?day=${day}&include_google=${google}`)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [day, google, version]);
  useEffect(() => {
    let live = true;
    api<{ days: Record<string, number> }>(
      `/planning/month?year=${year}&month=${monthNumber}`,
    )
      .then((r) => live && setCounts(r.days))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [year, monthNumber, version]);
  useEffect(() => {
    const navigate = (e: Event) => {
      const value = (e as CustomEvent).detail;
      if (
        value.tab === "agenda" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value.day || "")
      ) {
        setDay(value.day);
        setMonth(value.day.slice(0, 7));
      }
    };
    window.addEventListener("cc-navigate", navigate);
    return () => window.removeEventListener("cc-navigate", navigate);
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setVersion((v) => v + 1);
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
        "/planning/appointments" + (editing ? "/" + editing.id : ""),
        send(editing ? "PUT" : "POST", {
          title: f.get("title"),
          notes: f.get("notes"),
          start_at: f.get("start_at"),
          end_at: f.get("end_at"),
          context: editing?.context || "personal",
          kind: f.get("kind"),
          completed: editing?.completed || false,
          reminder_minutes:
            f.get("reminder_minutes") === ""
              ? null
              : Number(f.get("reminder_minutes")),
          notify_system: f.get("notify_system") === "on",
          notify_email: f.get("notify_email") === "on",
        }),
      );
      setEditing(undefined);
    });
  }
  useEffect(() => {
    if (initialDay) {
      setDay(initialDay);
      setMonth(initialDay.slice(0, 7));
    }
  }, [initialDay]);
  const leading = (new Date(year, m, 1).getDay() + 6) % 7,
    total = new Date(year, m + 1, 0).getDate(),
    today = todayInAccount();
  function shift(delta: number) {
    const next = new Date(year, m + delta, 1);
    if (next.getFullYear() < 2000 || next.getFullYear() > 2100) return;
    setMonth(dateKey(next.getFullYear(), next.getMonth(), 1).slice(0, 7));
  }
  return (
    <>
      <div className="page-heading">
        <h1>Agenda</h1>
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          Novo registro
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="calendar-heading">
            <button
              className="icon-button"
              aria-label="Mês anterior"
              onClick={() => shift(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <h2>
              {new Date(year, m, 1).toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              className="icon-button"
              aria-label="Próximo mês"
              onClick={() => shift(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-week">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-days">
            {Array.from({ length: leading }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: total }, (_, i) => {
              const date = dateKey(year, m, i + 1);
              return (
                <button
                  key={date}
                  aria-label={`${dateLabel(date)}${counts[date] ? `, ${counts[date]} registros` : ""}`}
                  aria-pressed={date === day}
                  aria-current={date === today ? "date" : undefined}
                  className={
                    (date === day ? "chosen " : "") +
                    (date === today ? "today" : "")
                  }
                  onClick={() => setDay(date)}
                >
                  <strong>{i + 1}</strong>
                  {!!counts[date] && (
                    <small>
                      {counts[date]}
                      <span className="calendar-count-label"> registros</span>
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <div className="calendar-footer">
            <button
              onClick={() => {
                setDay(today);
                setMonth(today.slice(0, 7));
              }}
            >
              Hoje
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={google}
                disabled={!connected}
                onChange={(e) => setGoogle(e.target.checked)}
              />
              Google Calendar
            </label>
            {!connected && (
              <button className="quiet" onClick={onConnections}>
                Conectar
              </button>
            )}
          </div>
          <small className="muted">
            Marcadores do calendário: registros locais.
          </small>
        </section>
        <section className="panel selected-day">
          <div className="panel-heading">
            <h2>{dateLabel(day)}</h2>
            <button className="quiet" onClick={() => setEditing(null)}>
              <Plus size={15} />
              Adicionar
            </button>
          </div>
          {!data ? (
            <p className="empty">Carregando…</p>
          ) : (
            <>
              {data.errors.map((e) => (
                <p className="error" key={e}>
                  {e}
                </p>
              ))}
              {data.events.length + data.tasks.length === 0 && (
                <p className="empty">Dia livre. Adicione um registro.</p>
              )}
              {[...data.events]
                .sort((a, b) => a.start_at.localeCompare(b.start_at))
                .map((item) => (
                  <article
                    key={item.source + item.id}
                    className={
                      "calendar-item " + (item.completed ? "completed" : "")
                    }
                  >
                    <span className="badge">
                      {item.source === "google"
                        ? "Google"
                        : kinds[item.kind || "appointment"]}
                    </span>
                    <h3>{item.title}</h3>
                    <p>
                      {item.all_day
                        ? "Dia inteiro"
                        : formatInstant(item.start_at) +
                          " → " +
                          formatInstant(item.end_at)}
                    </p>
                    {item.notes && <p>{item.notes}</p>}
                    {item.reminder_minutes != null && (
                      <small>
                        Lembrete:{" "}
                        {item.reminder_minutes === 0
                          ? "no horário"
                          : item.reminder_minutes + " min antes"}
                        {item.notify_system ? " · Command" : ""}
                        {item.notify_email ? " · e-mail" : ""}
                      </small>
                    )}
                    {item.email_error && (
                      <p className="error">{item.email_error}</p>
                    )}
                    <div className="calendar-item-actions">
                      {item.source === "local" ? (
                        <>
                          <button
                            className="quiet"
                            onClick={() => setEditing(item)}
                          >
                            Editar
                          </button>
                          {item.kind === "todo" && (
                            <button
                              className="quiet"
                              disabled={busy}
                              onClick={() =>
                                run(() =>
                                  api(
                                    "/planning/appointments/" + item.id,
                                    send("PUT", {
                                      title: item.title,
                                      notes: item.notes || "",
                                      start_at: item.start_at,
                                      end_at: item.end_at,
                                      context: item.context || "personal",
                                      kind: item.kind,
                                      completed: !item.completed,
                                      reminder_minutes: item.reminder_minutes,
                                      notify_system: item.notify_system,
                                      notify_email: item.notify_email,
                                    }),
                                  ),
                                )
                              }
                            >
                              {item.completed ? "Reabrir" : "Concluir"}
                            </button>
                          )}
                          <button
                            className="quiet danger"
                            disabled={busy}
                            onClick={async () => {
                              if (await confirmAction("Excluir este registro?"))
                                run(() =>
                                  api("/planning/appointments/" + item.id, {
                                    method: "DELETE",
                                  }),
                                );
                            }}
                          >
                            Excluir
                          </button>
                        </>
                      ) : (
                        item.link && (
                          <a href={item.link} target="_blank" rel="noreferrer">
                            Abrir no Google
                          </a>
                        )
                      )}
                    </div>
                  </article>
                ))}
              {data.tasks.map((task) => (
                <article className="calendar-item" key={task.id}>
                  <span className="badge">Afazer existente</span>
                  <h3>{task.title}</h3>
                  <a href={`/#/tarefa/${task.id}`}>Abrir</a>
                </article>
              ))}
              {data.limited && (
                <small>Há mais eventos no Google Calendar.</small>
              )}
            </>
          )}
        </section>
      </div>
      {editing !== undefined && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-title"
          >
            <div className="dialog-heading">
              <h2 id="appointment-title">
                {editing ? "Editar registro" : "Novo registro"}
              </h2>
              <button
                className="icon-button"
                aria-label="Fechar registro"
                onClick={() => setEditing(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Título
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={editing?.title}
                />
              </label>
              <label>
                Tipo
                <select
                  aria-label="Tipo"
                  name="kind"
                  defaultValue={editing?.kind || "appointment"}
                >
                  {Object.entries(kinds).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Início
                  <input
                    type="datetime-local"
                    name="start_at"
                    required
                    defaultValue={
                      editing ? localTime(editing.start_at) : day + "T09:00"
                    }
                  />
                </label>
                <label>
                  Fim
                  <input
                    type="datetime-local"
                    name="end_at"
                    required
                    defaultValue={
                      editing ? localTime(editing.end_at) : day + "T10:00"
                    }
                  />
                </label>
              </div>
              <small>{getPreferences().timezone}</small>
              <label>
                Observações
                <textarea
                  name="notes"
                  maxLength={3000}
                  defaultValue={editing?.notes}
                />
              </label>
              <label>
                Lembrete
                <select
                  aria-label="Lembrete"
                  name="reminder_minutes"
                  defaultValue={editing?.reminder_minutes ?? ""}
                >
                  <option value="">Sem lembrete</option>
                  {[0, 5, 15, 30, 60, 1440, 10080].map((n) => (
                    <option key={n} value={n}>
                      {n === 0
                        ? "No horário"
                        : n < 60
                          ? n + " minutos antes"
                          : n < 1440
                            ? "1 hora antes"
                            : n === 1440
                              ? "1 dia antes"
                              : "1 semana antes"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label className="checkbox-label">
                  <input
                    name="notify_system"
                    type="checkbox"
                    defaultChecked={editing?.notify_system ?? true}
                  />
                  No Command
                </label>
                <label className="checkbox-label">
                  <input
                    name="notify_email"
                    type="checkbox"
                    disabled={!emailReady}
                    defaultChecked={emailReady && editing?.notify_email}
                  />
                  Por e-mail
                </label>
              </div>
              {!emailReady && (
                <small>Ative o envio de e-mail em Fontes e conexões.</small>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setEditing(undefined)}>
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  Salvar registro
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
