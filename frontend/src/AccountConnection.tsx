import { useEffect, useState, useRef } from "react";
import { api } from "./api";
import { formatInstant } from "./userPreferences";
import { confirmAction, dataChanged } from "./feedback";
type State = {
  configured: boolean;
  can_configure?: boolean;
  connected: boolean;
  account: string | null;
  callback_url?: string;
  checked_at?: string | null;
  last_error?: string | null;
  permissions?: string[];
};
export default function AccountConnection({
  provider,
  onRepository,
  onList,
}: {
  provider: "github" | "microsoft" | "google";
  onRepository?: (value: string) => void;
  onList?: (value: string) => void;
}) {
  const label =
    provider === "github"
      ? "GitHub"
      : provider === "microsoft"
        ? "Microsoft 365"
        : "Google Calendar";
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [repos, setRepos] = useState<{ name: string; description: string }[]>([]),
    [lists, setLists] = useState<{ id: string; name: string }[]>([]),
    [search, setSearch] = useState(""),
    [help, setHelp] = useState(false);
  const cleanup = useRef<() => void>(() => {});
  const popupRef = useRef<Window | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      api<Record<string, State>>("/integrations")
        .then((r) => {
          if (live) setState(r[provider]);
        })
        .catch((e) => live && setError(e.message));
    refresh();
    window.addEventListener("cc-connections-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      cleanup.current();
      window.removeEventListener("cc-connections-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [provider]);
  async function connect() {
    cleanup.current();
    const popup = window.open(
      "about:blank",
      "cc-oauth-" + provider,
      "popup,width=620,height=760",
    );
    popupRef.current = popup;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(
        `/integrations/${provider}/start?popup=${!!popup}`,
        { method: "POST" },
      );
      if (!popup) {
        window.location.assign(r.url);
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cleanup.current();
        popupRef.current = null;
        setBusy(false);
        window.dispatchEvent(new Event("cc-connections-changed"));
        dataChanged();
      };
      const message = (e: MessageEvent) => {
        if (
          e.origin !== window.location.origin ||
          e.source !== popup ||
          e.data?.type !== "cc-oauth-result" ||
          e.data.provider !== provider
        )
          return;
        if (e.data.outcome !== "connected")
          setError(
            e.data.outcome === "cancelled"
              ? "Autorização cancelada."
              : "Não foi possível conectar. Confira o aplicativo e tente novamente.",
          );
        finish();
      };
      window.addEventListener("message", message);
      let polling = false;
      const poll = window.setInterval(async () => {
        if (polling) return;
        if (popup.closed) {
          finish();
          return;
        }
        polling = true;
        try {
          const status = await api<Record<string, State>>("/integrations");
          if (!done) setState(status[provider]);
        } catch {
        } finally {
          polling = false;
        }
      }, 2000);
      const timeout = window.setTimeout(
        () => {
          setError("A autorização expirou. Tente conectar novamente.");
          finish();
        },
        10 * 60 * 1000,
      );
      cleanup.current = () => {
        done = true;
        window.clearInterval(poll);
        window.clearTimeout(timeout);
        window.removeEventListener("message", message);
      };
      popup.location.href = r.url;
    } catch (e) {
      cleanup.current();
      popupRef.current = null;
      popup?.close();
      setBusy(false);
      setError((e as Error).message);
    }
  }
  async function disconnect() {
    if (
      !(await confirmAction(
        "Desconectar esta conta? A autorização local será removida. Seus painéis serão mantidos.",
      ))
    )
      return;
    setBusy(true);
    try {
      await api(`/integrations/${provider}`, { method: "DELETE" });
      setState((s) => (s ? { ...s, connected: false, account: null } : null));
      setRepos([]);
      setLists([]);
      dataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load(next = 1) {
    setBusy(true);
    setError("");
    try {
      if (provider === "github") {
        const r = await api<{ items: typeof repos; has_more: boolean }>(
          `/integrations/github/repositories?page=${next}`,
        );
        setRepos(r.items);
        setMore(r.has_more);
        setPage(next);
      } else {
        setLists(await api<typeof lists>("/integrations/microsoft/lists"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-connection">
      <strong>{label}</strong>
      <p>
        {state?.connected
          ? `Conectado: ${state.account}`
          : "Conecte sua conta para escolher o que acompanhar."}
      </p>
      <small>
        {state?.checked_at
          ? "Última consulta: " + formatInstant(state.checked_at)
          : "Nenhuma consulta registrada"}
      </small>
      {state?.permissions && (
        <small>Permissões solicitadas: {state.permissions.join(" · ")}</small>
      )}
      {state?.last_error && <p className="error">{state.last_error}</p>}
      <div className="connection-actions">
        {state?.connected ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                provider === "google"
                  ? window.dispatchEvent(
                      new CustomEvent("cc-navigate", {
                        detail: { tab: "agenda" },
                      }),
                    )
                  : load()
              }
            >
              {provider === "github"
                ? "Listar repositórios"
                : provider === "microsoft"
                  ? "Listar listas do To Do"
                  : "Ver agenda"}
            </button>
            <button type="button" disabled={busy} onClick={connect}>
              Reconectar
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={disconnect}
            >
              Desconectar
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy || !state}
            onClick={() => (state?.configured ? connect() : setHelp(true))}
          >
            {"Conectar " + (provider === "microsoft" ? "Microsoft" : label)}
          </button>
        )}
      </div>
      {help && (
        <p className="connection-help">
          {state?.can_configure
            ? "Abra Fontes e conexões → Conexões → Configurar aplicativos para cadastrar o Client ID e o Client Secret."
            : "O administrador precisa habilitar este serviço. Depois, você poderá conectar sua conta aqui."}
        </p>
      )}
      {busy && popupRef.current && (
        <p className="muted">Conclua a autorização na janela do serviço.</p>
      )}
      {provider === "github" && repos.length > 0 && (
        <>
          <input
            aria-label="Filtrar repositórios"
            placeholder="Filtrar esta página…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="repository-choices">
            {repos
              .filter((r) =>
                r.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((r) => (
                <button
                  type="button"
                  key={r.name}
                  onClick={() => onRepository?.(r.name)}
                >
                  <strong>{r.name}</strong>
                  <small>{r.description}</small>
                </button>
              ))}
          </div>
          <div className="connection-actions">
            <button
              type="button"
              disabled={busy || page === 1}
              onClick={() => load(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page}</span>
            <button
              type="button"
              disabled={busy || !more || page >= 20}
              onClick={() => load(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
      {lists.length > 0 && (
        <label>
          Lista do Microsoft To Do
          <select
            aria-label="Lista do Microsoft To Do"
            defaultValue=""
            onChange={(e) => onList?.(e.target.value)}
          >
            <option value="" disabled>
              Selecione uma lista
            </option>
            {lists.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {state?.connected && (
        <small>
          {provider === "github"
            ? "Lista de repositórios públicos aos quais sua conta está associada."
            : provider === "microsoft"
              ? "Somente leitura de perfil e tarefas. Nenhuma conversa ou mensagem é consultada."
              : "Somente leitura de perfil e calendários. Alterações são feitas no Google Calendar."}
        </small>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
