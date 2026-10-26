import { useEffect, useState } from "react";
import { api, send } from "./api";
type Provider = "github" | "google" | "microsoft";
type AppConfig = {
  client_id: string;
  has_secret: boolean;
  source: string;
  callback_url: string;
  tenant: string;
};
const labels = {
  github: "GitHub",
  google: "Google Calendar",
  microsoft: "Microsoft 365",
};
const links = {
  github: "https://github.com/settings/developers",
  google: "https://console.cloud.google.com/apis/credentials",
  microsoft: "https://entra.microsoft.com/",
};
export default function ApplicationSettings() {
  const [admin, setAdmin] = useState(false),
    [open, setOpen] = useState(false),
    [apps, setApps] = useState<Partial<Record<Provider, AppConfig>>>({}),
    [provider, setProvider] = useState<Provider>("github"),
    [id, setId] = useState(""),
    [secret, setSecret] = useState(""),
    [tenant, setTenant] = useState("organizations"),
    [password, setPassword] = useState(""),
    [disconnect, setDisconnect] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<{ is_admin: boolean }>("/auth/me")
      .then((u) => live && setAdmin(u.is_admin))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function load() {
    const r = await api<Record<Provider, AppConfig>>(
      "/integrations/admin/applications",
    );
    setApps(r);
    setId(r[provider].client_id);
    setTenant(r[provider].tenant);
  }
  async function show() {
    setBusy(true);
    setError("");
    try {
      await load();
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function choose(p: Provider) {
    setProvider(p);
    setId(apps[p]?.client_id || "");
    setTenant(apps[p]?.tenant || "organizations");
    setSecret("");
    setPassword("");
    setDisconnect(false);
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/integrations/admin/applications/${provider}`,
        send("PUT", {
          client_id: id,
          client_secret: secret,
          tenant,
          password,
          disconnect_accounts: disconnect,
        }),
      );
      setPassword("");
      setSecret("");
      setDisconnect(false);
      await load();
      window.dispatchEvent(new Event("cc-connections-changed"));
    } catch (e) {
      setPassword("");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!admin) return null;
  return (
    <section className="panel application-settings">
      <div className="panel-heading">
        <div>
          <h2>Aplicativos de conexão</h2>
          <p>Configuração do administrador, uma vez por serviço.</p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            if (open) {
              setOpen(false);
              setSecret("");
              setPassword("");
            } else show();
          }}
        >
          {open ? "Fechar configuração" : "Configurar aplicativos"}
        </button>
      </div>
      {error && !open && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <form onSubmit={save}>
          <label>
            Serviço
            <select
              aria-label="Serviço de conexão"
              value={provider}
              onChange={(e) => choose(e.target.value as Provider)}
            >
              {Object.entries(labels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <ol className="setup-steps">
            <li>
              <a href={links[provider]} target="_blank" rel="noreferrer">
                Abrir cadastro do aplicativo em {labels[provider]}
              </a>
            </li>
            <li>
              Cadastre a URL de retorno abaixo. No Google, habilite também a
              Calendar API; na Microsoft, use a plataforma Web.
            </li>
            <li>Copie o Client ID e o Client Secret e salve aqui.</li>
          </ol>
          <label>
            URL de retorno
            <input
              aria-label="URL de retorno do aplicativo"
              value={apps[provider]?.callback_url || ""}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <label>
            Client ID
            <input
              aria-label="Client ID"
              required
              maxLength={300}
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Client Secret
            <input
              aria-label="Client Secret"
              type="password"
              maxLength={2000}
              value={secret}
              placeholder={
                apps[provider]?.has_secret
                  ? "Já salvo; deixe vazio para manter"
                  : "Cole o segredo do aplicativo"
              }
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {provider === "microsoft" && (
            <label>
              Tenant
              <input
                aria-label="Tenant"
                required
                value={tenant}
                maxLength={100}
                onChange={(e) => setTenant(e.target.value)}
              />
            </label>
          )}
          <small>
            Origem atual:{" "}
            {apps[provider]?.source === "system"
              ? "salvo no Command"
              : "ambiente do servidor"}
            . O segredo nunca é exibido novamente.
          </small>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={disconnect}
              onChange={(e) => setDisconnect(e.target.checked)}
            />
            Confirmo que as contas deste serviço precisarão reconectar se eu
            salvar.
          </label>
          <label>
            Sua senha atual
            <input
              aria-label="Senha para configurar aplicativos"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar aplicativo"}
          </button>
          <p className="muted">
            Depois, use Conectar e autorize sua própria conta no site oficial.
          </p>
        </form>
      )}
    </section>
  );
}
