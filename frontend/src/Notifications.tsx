import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Undo2,
} from "lucide-react";
import { api } from "./api";
import {
  notify,
  dataChanged,
  type ToastMessage,
  type UndoAction,
} from "./feedback";
type Notice = {
  id: string;
  title: string;
  message: string;
  level: string;
  read: boolean;
  created_at: string;
  action: UndoAction | null;
};
async function undo(action: UndoAction) {
  await api(`/notifications/restore/${action.kind}/${action.id}`, {
    method: "POST",
  });
  dataChanged();
  notify({ title: "Exclusão desfeita", message: "O registro foi restaurado." });
  window.dispatchEvent(new Event("cc-notifications-changed"));
}
export function NotificationHub() {
  const [toasts, setToasts] = useState<(ToastMessage & { id: number })[]>([]),
    [confirmation, setConfirmation] = useState<{
      message: string;
      resolve: (answer: boolean) => void;
    } | null>(null);
  useEffect(() => {
    let sequence = 0;
    const timers: number[] = [];
    const show = (event: Event) => {
      const detail = (event as CustomEvent<ToastMessage>).detail;
      const id = Date.now() + sequence++;
      setToasts((t) => [...t.slice(-3), { ...detail, id }]);
      timers.push(
        window.setTimeout(
          () => setToasts((t) => t.filter((x) => x.id !== id)),
          detail.action ? 12000 : 7000,
        ),
      );
    };
    const confirm = (event: Event) =>
      setConfirmation((event as CustomEvent).detail);
    window.addEventListener("cc-toast", show);
    window.addEventListener("cc-confirm", confirm);
    return () => {
      window.removeEventListener("cc-toast", show);
      window.removeEventListener("cc-confirm", confirm);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <>
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={"system-toast " + (t.level || "success")}
            role={t.level === "error" ? "alert" : "status"}
          >
            <span className="toast-icon">
              {t.level === "error" || t.level === "warning" ? (
                <AlertCircle size={19} />
              ) : t.level === "info" ? (
                <Info size={19} />
              ) : (
                <CheckCircle2 size={19} />
              )}
            </span>
            <div>
              <strong>{t.title}</strong>
              {t.message && <p>{t.message}</p>}
              {t.action && (
                <button
                  onClick={() =>
                    undo(t.action!)
                      .then(() =>
                        setToasts((rows) => rows.filter((x) => x.id !== t.id)),
                      )
                      .catch((e) =>
                        notify({ title: e.message, level: "error" }),
                      )
                  }
                >
                  <Undo2 size={13} />
                  Desfazer
                </button>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="Dispensar notificação"
              onClick={() =>
                setToasts((rows) => rows.filter((x) => x.id !== t.id))
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {confirmation && (
        <div className="modal-backdrop">
          <section
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">Confirmar exclusão</h2>
            <p>{confirmation.message}</p>
            <div className="modal-actions">
              <button
                autoFocus
                onClick={() => {
                  confirmation.resolve(false);
                  setConfirmation(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  confirmation.resolve(true);
                  setConfirmation(null);
                }}
              >
                Excluir
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export function NotificationBell() {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Notice[]>([]),
    [unread, setUnread] = useState(0),
    [error, setError] = useState("");
  async function load() {
    try {
      const r = await api<{ items: Notice[]; unread: number }>(
        "/notifications",
      );
      setItems(r.items);
      setUnread(r.unread);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let timer: number;
    load();
    const reload = () => {
      clearTimeout(timer);
      timer = window.setTimeout(load, 200);
    };
    window.addEventListener("cc-notifications-changed", reload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("cc-notifications-changed", reload);
    };
  }, []);
  return (
    <div className="notification-bell">
      <button
        aria-label="Notificações"
        aria-expanded={open}
        className="icon-button"
        onClick={() => {
          setOpen(!open);
          load();
        }}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="notification-count">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notification-inbox"
          role="dialog"
          aria-label="Central de notificações"
        >
          <div className="notification-inbox-heading">
            <h2>Notificações</h2>
            <button
              className="icon-button"
              title="Marcar todas como lidas"
              aria-label="Marcar todas como lidas"
              onClick={() =>
                api("/notifications/read-all", { method: "POST" })
                  .then(load)
                  .catch((e) => setError(e.message))
              }
            >
              <CheckCheck size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Fechar notificações"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          {items.length === 0 ? (
            <div className="empty compact">Tudo em dia por aqui.</div>
          ) : (
            <div className="notification-items">
              {items.map((n) => (
                <article key={n.id} className={!n.read ? "unread" : ""}>
                  <button
                    className="notification-text"
                    onClick={() =>
                      api(`/notifications/${n.id}/read`, {
                        method: "POST",
                      })
                        .then(load)
                        .catch((e) => setError(e.message))
                    }
                  >
                    <strong>{n.title}</strong>
                    {n.message && <p>{n.message}</p>}
                    <small>
                      {new Date(n.created_at + "Z").toLocaleString("pt-BR")}
                    </small>
                  </button>
                  {n.action &&
                    Date.now() - new Date(n.created_at + "Z").getTime() <
                      600000 && (
                      <button
                        className="quiet"
                        onClick={() =>
                          undo(n.action!)
                            .then(load)
                            .catch((e) => setError(e.message))
                            .catch((e) =>
                              notify({ title: e.message, level: "error" }),
                            )
                        }
                      >
                        Desfazer
                      </button>
                    )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
