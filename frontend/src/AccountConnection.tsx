import { useEffect, useState } from "react";
import { api } from "./api";
import { formatInstant } from "./userPreferences";
import { confirmAction, dataChanged } from "./feedback";
type State = {
  configured: boolean;
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
  useEffect(() => {
    let live = true;
    api<Record<string, State>>("/integrations")
      .then((r) => live && setState(r[provider]))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [provider]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(`/integrations/${provider}/start`, {
        method: "POST",
      });
      window.location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
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
      {state?.callback_url && (
        <div className="connection-help">
          <small>
            Cadastre esta URL de retorno no aplicativo{" "}
            {provider === "github"
              ? "do GitHub (Authorization callback URL)"
              : provider === "microsoft"
                ? "da Microsoft (Redirect URI)"
                : "do Google (Authorized redirect URI)"}
            :
          </small>
          <input
            aria-label="URL de retorno da conexão"
            value={state.callback_url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <small>
            O Client ID e o Secret devem pertencer ao mesmo aplicativo.
          </small>
          {new URL(state.callback_url).origin !== window.location.origin && (
            <p>
              Para autorizar com a mesma sessão,{" "}
              <a href={new URL(state.callback_url).origin}>
                abra o endereço configurado
              </a>{" "}
              e entre novamente.
            </p>
          )}
        </div>
      )}
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
        <div className="connection-help">
          <p>
            Ative a conexão configurando{" "}
            {provider === "github"
              ? "GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET"
              : provider === "microsoft"
                ? "MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET"
                : "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET"}{" "}
            no .env do servidor. Veja o guia{" "}
            <a
              href="https://github.com/phzl0/CommanderCenter/blob/main/docs/connections.md"
              target="_blank"
              rel="noreferrer"
            >
              de conexão de contas
            </a>
            .
          </p>
          <small>
            Sem essa configuração, você ainda pode usar os outros cards
            normalmente.
          </small>
        </div>
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
          {state?.callback_url && (
            <div className="connection-help">
              <small>
                Cadastre esta URL de retorno no aplicativo{" "}
                {provider === "github"
                  ? "do GitHub (Authorization callback URL)"
                  : provider === "microsoft"
                    ? "da Microsoft (Redirect URI)"
                    : "do Google (Authorized redirect URI)"}
                :
              </small>
              <input
                aria-label="URL de retorno da conexão"
                value={state.callback_url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <small>
                O Client ID e o Secret devem pertencer ao mesmo aplicativo.
              </small>
              {new URL(state.callback_url).origin !==
                window.location.origin && (
                <p>
                  Para autorizar com a mesma sessão,{" "}
                  <a href={new URL(state.callback_url).origin}>
                    abra o endereço configurado
                  </a>{" "}
                  e entre novamente.
                </p>
              )}
            </div>
          )}
          <small>
            {state?.checked_at
              ? "Última consulta: " + formatInstant(state.checked_at)
              : "Nenhuma consulta registrada"}
          </small>
          {state?.permissions && (
            <small>
              Permissões solicitadas: {state.permissions.join(" · ")}
            </small>
          )}
          {state?.last_error && <p className="error">{state.last_error}</p>}
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
