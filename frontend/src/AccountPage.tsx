import { useEffect, useState } from "react";
import { Camera, ShieldCheck, UserRound, Link, Settings } from "lucide-react";
import { api, send, type User } from "./api";
import { confirmAction } from "./feedback";
import { formatInstant, type Preferences } from "./userPreferences";
import AccountConnection from "./AccountConnection";
import type { AccountSection } from "./AccountMenu";
type Session = {
  current: boolean;
  device: string;
  created_at: string;
  expires_at: string;
};
const titles = {
  profile: "Meu perfil",
  preferences: "Preferências",
  connections: "Conexões",
  security: "Segurança",
};
export default function AccountPage({
  user,
  section,
  onUser,
  onSection,
}: {
  user: User;
  section: AccountSection;
  onUser: (user: User) => void;
  onSection: (section: AccountSection) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [prefs, setPrefs] = useState(user.preferences);
  useEffect(() => {
    setError("");
    if (section === "security")
      api<Session[]>("/account/sessions")
        .then(setSessions)
        .catch((e) => setError(e.message));
  }, [section]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () =>
      onUser(
        await api<User>(
          "/account/profile",
          send("PUT", {
            name: f.get("name"),
            occupation: f.get("occupation"),
            bio: f.get("bio"),
            interests: f.get("interests"),
          }),
        ),
      ),
    );
  }
  async function savePrefs(e: React.FormEvent) {
    e.preventDefault();
    await run(async () =>
      onUser(await api<User>("/account/preferences", send("PUT", prefs))),
    );
  }
  function pref<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }
  async function photo(file: File) {
    const data = new FormData();
    data.set("file", file);
    await run(async () =>
      onUser(
        await api<User>("/account/avatar", { method: "POST", body: data }),
      ),
    );
  }
  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    await run(async () => {
      if (f.get("new_password") !== f.get("confirm_password"))
        throw Error("As novas senhas precisam ser iguais.");
      await api(
        "/account/password",
        send("POST", {
          current_password: f.get("current_password"),
          new_password: f.get("new_password"),
        }),
      );
      form.reset();
      setSessions(await api<Session[]>("/account/sessions"));
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MINHA CONTA · ESPAÇO PRIVADO</span>
          <h1>{titles[section]}</h1>
          <p>Suas informações e preferências acompanham sua conta.</p>
        </div>
      </div>
      <div className="account-tabs segment">
        {(["profile", "preferences", "connections", "security"] as const).map(
          (id) => (
            <button
              className={section === id ? "active" : ""}
              key={id}
              onClick={() => onSection(id)}
            >
              {titles[id]}
            </button>
          ),
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {section === "profile" && (
        <div className="account-page-grid">
          <section className="panel profile-summary">
            <div className="profile-photo">
              {user.has_avatar ? (
                <img
                  src={`/api/account/avatar?v=${user.avatar_version}`}
                  alt="Foto do perfil"
                />
              ) : (
                <UserRound size={44} />
              )}
            </div>
            <h2>{user.name}</h2>
            <p>
              {user.occupation ||
                "Seu espaço de organização pessoal e profissional"}
            </p>
            <label className="photo-upload">
              <Camera size={16} />
              Alterar foto
              <input
                aria-label="Alterar foto"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) photo(file);
                  e.target.value = "";
                }}
              />
            </label>
            {user.has_avatar && (
              <button
                className="quiet"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    onUser(
                      await api<User>("/account/avatar", { method: "DELETE" }),
                    ),
                  )
                }
              >
                Remover foto
              </button>
            )}
            <small>PNG, JPEG ou WEBP · até 5 MB. Perfil privado.</small>
            <dl>
              <dt>E-mail</dt>
              <dd>{user.email}</dd>
              <dt>Conta criada</dt>
              <dd>
                {new Date(user.created_at + "Z").toLocaleDateString("pt-BR")}
              </dd>
            </dl>
            <button onClick={() => onSection("security")}>
              <ShieldCheck size={15} />
              Segurança da conta
            </button>
          </section>
          <section className="panel account-form">
            <h2>Dados do perfil</h2>
            <form onSubmit={saveProfile}>
              <label>
                Nome de exibição
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={user.name}
                />
              </label>
              <label>
                Área de atuação
                <input
                  name="occupation"
                  maxLength={100}
                  defaultValue={user.occupation}
                  placeholder="Tecnologia, administração, estudos…"
                />
              </label>
              <label>
                Descrição curta
                <textarea
                  name="bio"
                  rows={4}
                  maxLength={500}
                  defaultValue={user.bio}
                />
              </label>
              <label>
                Interesses
                <input
                  name="interests"
                  maxLength={300}
                  defaultValue={user.interests}
                  placeholder="Empresas, programação, economia…"
                />
              </label>
              <small>
                Os interesses ficam registrados no perfil. Os filtros dos
                radares continuam definidos em cada card.
              </small>
              <button className="primary" disabled={busy}>
                Salvar perfil
              </button>
            </form>
          </section>
        </div>
      )}
      {section === "preferences" && (
        <section className="panel account-form">
          <h2>Personalizar meu uso</h2>
          <form onSubmit={savePrefs}>
            <div className="form-grid">
              <label>
                Página inicial
                <select
                  aria-label="Página inicial"
                  value={prefs.homepage}
                  onChange={(e) =>
                    pref("homepage", e.target.value as Preferences["homepage"])
                  }
                >
                  <option value="dashboard">Visão geral</option>
                </select>
              </label>
              <label>
                Fuso horário
                <select
                  aria-label="Fuso horário"
                  value={prefs.timezone}
                  onChange={(e) => pref("timezone", e.target.value)}
                >
                  {Array.from(
                    new Set([
                      prefs.timezone,
                      "America/Sao_Paulo",
                      "America/Manaus",
                      "America/New_York",
                      "Europe/Lisbon",
                      "UTC",
                    ]),
                  ).map((zone) => (
                    <option key={zone}>{zone}</option>
                  ))}
                </select>
              </label>
              <label>
                Tamanho do texto
                <select
                  aria-label="Tamanho do texto"
                  value={prefs.font_size}
                  onChange={(e) =>
                    pref(
                      "font_size",
                      e.target.value as Preferences["font_size"],
                    )
                  }
                >
                  <option value="normal">Padrão</option>
                  <option value="large">Ampliado</option>
                </select>
              </label>
              <label>
                Capacidade diária em minutos
                <input
                  aria-label="Capacidade diária em minutos"
                  type="number"
                  min={15}
                  max={1440}
                  value={prefs.daily_capacity}
                  onChange={(e) =>
                    pref("daily_capacity", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={prefs.reduce_motion}
                onChange={(e) => pref("reduce_motion", e.target.checked)}
              />
              Reduzir animações e iniciar notícias pausadas
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={prefs.notify_success}
                onChange={(e) => pref("notify_success", e.target.checked)}
              />
              Mostrar e registrar avisos de operações concluídas
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={prefs.deadline_alerts}
                onChange={(e) => pref("deadline_alerts", e.target.checked)}
              />
              Gerar alertas de prazos e conexões sem consulta recente
            </label>
            <label>
              Antecedência dos alertas
              <select
                aria-label="Antecedência dos alertas"
                value={prefs.alert_days}
                onChange={(e) =>
                  pref(
                    "alert_days",
                    Number(e.target.value) as Preferences["alert_days"],
                  )
                }
              >
                <option value={0}>No dia do prazo</option>
                <option value={1}>1 dia antes</option>
                <option value={3}>3 dias antes</option>
                <option value={7}>7 dias antes</option>
              </select>
            </label>
            <p className="account-note">
              A paleta azul-marinho e verde-claro é o tema padrão. Avisos de
              erro e ações para desfazer exclusões continuam disponíveis. Os
              alertas são consultados enquanto o sistema está aberto.
            </p>
            <button className="primary" disabled={busy}>
              Salvar preferências
            </button>
          </form>
        </section>
      )}
      {section === "connections" && (
        <>
          <div className="connections-intro panel">
            <Link size={20} />
            <div>
              <h2>Serviços conectados</h2>
              <p>
                Conecte uma vez e escolha os dados nos cards ou na agenda. As
                permissões abaixo são as solicitadas pelo aplicativo.
              </p>
            </div>
          </div>
          <div className="connections-grid">
            <AccountConnection provider="github" />
            <AccountConnection provider="microsoft" />
            <AccountConnection provider="google" />
          </div>
          <section className="panel account-form">
            <h2>Outras fontes</h2>
            <p>
              BCB e Open-Meteo usam consultas públicas. RSS personalizados ficam
              em Fontes. Ações exigem ALPHA_VANTAGE_API_KEY no servidor.
              Credenciais não são exibidas nesta página.
            </p>
          </section>
        </>
      )}
      {section === "security" && (
        <div className="account-page-grid">
          <section className="panel account-form">
            <h2>Trocar senha</h2>
            <p>
              A troca encerra as sessões anteriores e mantém este navegador
              conectado com uma nova sessão.
            </p>
            <form onSubmit={password}>
              <label>
                Senha atual
                <input
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
              <label>
                Nova senha
                <input
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <label>
                Confirmar nova senha
                <input
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
              <button className="primary" disabled={busy}>
                Atualizar senha
              </button>
            </form>
          </section>
          <section className="panel account-form">
            <h2>Sessões ativas</h2>
            <p>
              Somente suas sessões. O e-mail permanece somente leitura nesta
              etapa.
            </p>
            {sessions.map((session, index) => (
              <article className="session-item" key={index}>
                <strong>
                  {session.current ? "Este navegador" : "Outro navegador"}
                </strong>
                <small>{session.device}</small>
                <span>Início: {formatInstant(session.created_at)}</span>
                <span>Expira: {formatInstant(session.expires_at)}</span>
              </article>
            ))}
            <button
              disabled={busy || sessions.filter((s) => !s.current).length === 0}
              onClick={async () => {
                if (
                  await confirmAction(
                    "Encerrar todas as outras sessões desta conta?",
                    {
                      title: "Encerrar sessões",
                      confirmLabel: "Encerrar sessões",
                    },
                  )
                )
                  run(async () => {
                    await api("/account/sessions/revoke-others", {
                      method: "POST",
                    });
                    setSessions(await api<Session[]>("/account/sessions"));
                  });
              }}
            >
              Encerrar outras sessões
            </button>
          </section>
        </div>
      )}
    </>
  );
}
