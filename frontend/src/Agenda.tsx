import { useEffect, useState } from "react";
import { CalendarDays, Plus, RefreshCw, X, ExternalLink } from "lucide-react";
import { api, send, dateLabel } from "./api";
import { confirmAction } from "./feedback";
import {
  todayInAccount,
  formatInstant,
  getPreferences,
} from "./userPreferences";
type Event = {
  id: string;
  title: string;
  notes?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  source: "local" | "google";
  context?: string;
  link?: string;
};
type Result = {
  day: string;
  timezone: string;
  events: Event[];
  tasks: { id: string; title: string }[];
  busy_minutes: number;
  capacity_minutes: number;
  remaining_minutes: number;
  limited: boolean;
  errors: string[];
  note: string;
};
function formTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getPreferences().timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export default function Agenda({
  onConnections,
}: {
  onConnections: () => void;
}) {
  const [day, setDay] = useState(todayInAccount),
    [data, setData] = useState<Result | null>(null),
    [google, setGoogle] = useState(false),
    [connected, setConnected] = useState(false),
    [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]),
    [calendarId, setCalendarId] = useState("primary"),
    [editing, setEditing] = useState<Event | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    api<{ google?: { connected: boolean } }>("/integrations")
      .then((r) => {
        if (live) {
          setConnected(!!r.google?.connected);
          setGoogle(!!r.google?.connected);
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
    api<Result>(
      `/planning/agenda?day=${day}&include_google=${google}&calendar_id=${encodeURIComponent(calendarId)}`,
    )
      .then((r) => live && setData(r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [day, google, calendarId, version]);
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
          context: f.get("context"),
        }),
      );
      setEditing(undefined);
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMPROMISSOS · PRAZOS · CAPACIDADE</span>
          <h1>Agenda</h1>
          <p>
            Veja compromissos com horário junto das tarefas que vencem no dia.
          </p>
        </div>
        <div className="agenda-actions">
          <button onClick={() => setVersion((v) => v + 1)}>
            <RefreshCw size={15} />
            Atualizar agenda
          </button>
          <button className="primary" onClick={() => setEditing(null)}>
            <Plus size={15} />
            Novo compromisso
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="panel agenda-toolbar">
        <label>
          Dia da agenda
          <input
            aria-label="Dia da agenda"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={day}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value);
            }}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={google}
            disabled={!connected}
            onChange={(e) => setGoogle(e.target.checked)}
          />
          Incluir Google Calendar
        </label>
        {connected ? (
          <>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await api<{
                    items: typeof calendars;
                    limited: boolean;
                  }>("/planning/calendars");
                  setCalendars(r.items);
                })
              }
            >
              Listar calendários
            </button>
            <select
              aria-label="Calendário Google"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
            >
              <option value="primary">Calendário principal</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <button className="quiet" onClick={onConnections}>
            Conectar Google Calendar
          </button>
        )}
      </section>
      {data ? (
        <>
          <div className="day-stats agenda-stats">
            <div>
              <span>Compromissos</span>
              <strong>{data.events.length}</strong>
            </div>
            <div>
              <span>Minutos ocupados</span>
              <strong>{data.busy_minutes}</strong>
            </div>
            <div>
              <span>Referência diária</span>
              <strong>{data.capacity_minutes} min</strong>
            </div>
            <div>
              <span>Disponível na referência</span>
              <strong>{data.remaining_minutes} min</strong>
            </div>
          </div>
          {data.errors.map((e) => (
            <div className="error" role="alert" key={e}>
              {e}
            </div>
          ))}
          <div className="day-grid">
            <section className="panel agenda-events">
              <div className="day-panel-heading">
                <CalendarDays size={20} />
                <div>
                  <h2>Compromissos do dia</h2>
                  <p>
                    {dateLabel(day)} · {data.timezone}
                  </p>
                </div>
              </div>
              {data.events.length ? (
                data.events.map((event) => (
                  <article
                    className="agenda-event"
                    key={event.source + event.id}
                  >
                    <span className="badge">
                      {event.source === "google"
                        ? "Google Calendar · leitura"
                        : "Local"}
                    </span>
                    <h3>{event.title}</h3>
                    <p>
                      {event.all_day
                        ? "Dia inteiro"
                        : formatInstant(event.start_at) +
                          " → " +
                          formatInstant(event.end_at)}
                    </p>
                    {event.notes && <p>{event.notes}</p>}
                    <div>
                      {event.source === "local" ? (
                        <>
                          <button
                            className="quiet"
                            onClick={() => setEditing(event)}
                          >
                            Editar compromisso
                          </button>
                          <button
                            className="quiet danger"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await confirmAction(
                                  "Excluir este compromisso local?",
                                )
                              )
                                run(() =>
                                  api("/planning/appointments/" + event.id, {
                                    method: "DELETE",
                                  }),
                                );
                            }}
                          >
                            Excluir compromisso
                          </button>
                        </>
                      ) : (
                        event.link && (
                          <a href={event.link} target="_blank" rel="noreferrer">
                            Abrir no Google <ExternalLink size={13} />
                          </a>
                        )
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty compact">
                  Nenhum compromisso para este dia.
                </div>
              )}
            </section>
            <section className="panel agenda-deadlines">
              <div className="day-panel-heading">
                <CalendarDays size={20} />
                <div>
                  <h2>Tarefas com prazo</h2>
                  <p>Tarefas não ocupam automaticamente um horário.</p>
                </div>
              </div>
              {data.tasks.map((t) => (
                <a
                  className="agenda-task-link"
                  key={t.id}
                  href={`/#/tarefa/${t.id}`}
                >
                  {t.title}
                </a>
              ))}
              {!data.tasks.length && (
                <div className="empty compact">
                  Sem tarefas pendentes com prazo neste dia.
                </div>
              )}
            </section>
          </div>
          <p className="muted planning-footnote">
            {data.note}{" "}
            {data.limited
              ? "Há mais eventos no Google Calendar; esta consulta foi limitada."
              : ""}
          </p>
        </>
      ) : (
        <section className="panel empty">Carregando agenda…</section>
      )}
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
                {editing ? "Editar compromisso" : "Novo compromisso"}
              </h2>
              <button
                className="icon-button"
                aria-label="Fechar compromisso"
                onClick={() => setEditing(undefined)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Título do compromisso
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={editing?.title}
                />
              </label>
              <div className="form-grid">
                <label>
                  Início
                  <input
                    name="start_at"
                    type="datetime-local"
                    required
                    defaultValue={
                      editing ? formTime(editing.start_at) : day + "T09:00"
                    }
                  />
                </label>
                <label>
                  Fim
                  <input
                    name="end_at"
                    type="datetime-local"
                    required
                    defaultValue={
                      editing ? formTime(editing.end_at) : day + "T10:00"
                    }
                  />
                </label>
              </div>
              <small>
                Horários interpretados no fuso da conta:{" "}
                {getPreferences().timezone}.
              </small>
              <label>
                Contexto do compromisso
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
                Observações
                <textarea
                  name="notes"
                  maxLength={3000}
                  defaultValue={editing?.notes}
                />
              </label>
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setEditing(undefined)}>
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  Salvar compromisso
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
