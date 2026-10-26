import { useEffect, useState, lazy, Suspense } from "react";
import {
  LayoutDashboard,
  ListTodo,
  FileSpreadsheet,
  Files,
  Command,
  ArrowUpRight,
  Menu,
  ChevronRight,
  ShieldCheck,
  Rss,
  Sun,
  Target,
  CalendarDays,
} from "lucide-react";
import AccountMenu, { type AccountSection } from "./AccountMenu";
import { applyPreferences } from "./userPreferences";
import { api, send, type User } from "./api";
import { Management } from "./Management";
import { notify } from "./feedback";
import { NotificationBell } from "./Notifications";
const AccountPage = lazy(() => import("./AccountPage"));
const NewsPage = lazy(() => import("./NewsPage"));
const DataWorkspace = lazy(() => import("./DataWorkspace"));
const Agenda = lazy(() => import("./Agenda"));
const MyDay = lazy(() => import("./MyDay"));
const Sources = lazy(() => import("./SourceWorkspace"));
const WidgetDetails = lazy(() => import("./WidgetDetails"));
const Intelligence = lazy(() => import("./Intelligence"));
type Tab =
  | "dashboard"
  | "tasks"
  | "imports"
  | "reports"
  | "sources"
  | "daily"
  | "account"
  | "goals"
  | "agenda"
  | "news";
const nav = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "news", label: "Notícias", icon: Rss },
  { id: "agenda", label: "Agenda", icon: CalendarDays },

  { id: "imports", label: "Dados e arquivos", icon: FileSpreadsheet },

  { id: "sources", label: "Fontes e conexões", icon: Rss },
] as const;
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [tab, setTab] = useState<Tab>("dashboard"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false);
  const [connectionReturn] = useState(() =>
    /^#\/connection\/(connected|failed|cancelled)$/.test(window.location.hash),
  );
  const [agendaDay, setAgendaDay] = useState<string | undefined>();
  const [taskOpenVersion, setTaskOpenVersion] = useState(0);
  const [accountSection, setAccountSection] =
    useState<AccountSection>("profile");
  const [taskId, setTaskId] = useState<string | null>(
    () =>
      window.location.hash.match(/^#\/tarefa\/([A-Za-z0-9-]+)$/)?.[1] || null,
  );
  const [detailId, setDetailId] = useState<string | null>(
    () =>
      window.location.hash.match(/^#\/painel\/([A-Za-z0-9-]+)$/)?.[1] || null,
  );
  useEffect(() => {
    const result = window.location.hash.match(
      /^#\/connection\/(connected|failed|cancelled)$/,
    )?.[1];
    if (result) {
      window.location.hash = "";
      setTimeout(
        () =>
          notify({
            title:
              result === "connected"
                ? "Conta conectada. Selecione um painel para configurar."
                : result === "cancelled"
                  ? "Conexão cancelada"
                  : "Falha na conexão. Confira o aplicativo e as permissões.",
            level: result === "failed" ? "error" : "info",
          }),
        600,
      );
    }
    const changed = () => {
      setDetailId(
        window.location.hash.match(/^#\/painel\/([A-Za-z0-9-]+)$/)?.[1] || null,
      );
      const task =
        window.location.hash.match(/^#\/tarefa\/([A-Za-z0-9-]+)$/)?.[1] || null;
      setTaskId(task);
      setTaskOpenVersion((v) => v + 1);
      setTab(task ? "tasks" : "dashboard");
      setMenu(false);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    api<User>("/auth/me")
      .then((u) => {
        setUser(u);
        applyPreferences(u.preferences);
        if (connectionReturn) {
          setTab("sources");
          setAccountSection("connections");
        } else if (!window.location.hash) setTab("dashboard");
        else if (window.location.hash.startsWith("#/tarefa/")) setTab("tasks");
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => {
      setUser(null);
      setError("Sua sessão expirou. Entre novamente.");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    const navigate = (e: Event) => {
      const value = (e as CustomEvent).detail;
      if (
        ![
          "dashboard",
          "daily",
          "tasks",
          "agenda",
          "goals",
          "account",
          "sources",
        ].includes(value?.tab)
      )
        return;
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      setDetailId(null);
      setTaskId(null);
      setMenu(false);
      if (value.tab === "agenda") setAgendaDay(value.day);
      setTab(value.section === "connections" ? "sources" : value.tab);
      if (
        ["profile", "preferences", "connections", "security"].includes(
          value.section,
        )
      )
        setAccountSection(value.section);
    };
    window.addEventListener("cc-navigate", navigate);
    return () => window.removeEventListener("cc-navigate", navigate);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.querySelector(".content")?.scrollTo({ top: 0 });
  }, [tab, detailId]);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const u = await api<User>(
        "/auth/login",
        send("POST", { email: f.get("email"), password: f.get("password") }),
      );
      setUser(u);
      applyPreferences(u.preferences);
      setTab("dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      applyPreferences();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (checking)
    return (
      <div className="loading-screen">
        <Command size={35} />
        <p>Abrindo seu espaço…</p>
      </div>
    );
  if (!user)
    return (
      <main className="login-page">
        <section className="login-story">
          <div className="brand">
            <span>
              <img src="/jester.svg" alt="" width="28" height="28" />
            </span>
            command<span className="brand-light">center</span>
          </div>
          <div>
            <span className="eyebrow">SEU CENTRO DE INTELIGÊNCIA</span>
            <h1>
              Informação conectada.
              <br />
              Decisões mais claras.
            </h1>
            <p>
              Mercado, rotina e dados conectados
              <br />
              no seu centro de operações pessoal.
            </p>
            <div className="login-feature">
              <ShieldCheck size={19} /> Privado por definição. Sob seu controle.
            </div>
          </div>
          <small>ORGANIZE · ANALISE · DECIDA</small>
        </section>
        <section className="login-form">
          <form onSubmit={login}>
            <span className="eyebrow">BEM-VINDO AO SEU ESPAÇO</span>
            <h2>Acessar Command Center</h2>
            <p>Entre com sua conta privada para continuar.</p>
            <label>
              E-mail
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="voce@exemplo.com"
                required
                maxLength={254}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Entrando…" : "Entrar no meu espaço"}{" "}
              <ArrowUpRight size={18} />
            </button>
            <small>
              O acesso é restrito a contas criadas pelo administrador.
            </small>
          </form>
        </section>
      </main>
    );
  const go = (t: Tab) => {
    if (window.location.hash)
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    setDetailId(null);
    setTaskId(null);
    setTab(t);
    window.scrollTo({ top: 0 });
    setMenu(false);
    setError("");
  };
  return (
    <div className="app">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="brand">
          <span>
            <img src="/jester.svg" alt="" width="28" height="28" />
          </span>
          command<span className="brand-light">center</span>
        </div>
        <span className="nav-label">CENTRO DE INFORMAÇÕES</span>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "selected" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {tab === n.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={17} />
            <span>
              Espaço privado<small>Seus dados, seu controle</small>
            </span>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-shade"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={22} />
            </button>
            <span>Meu centro</span>
            <ChevronRight size={14} />
            <strong>
              {detailId
                ? "Detalhes do painel"
                : tab === "account"
                  ? "Minha conta"
                  : nav.find((n) => n.id === tab)?.label}
            </strong>
          </div>
          <div className="topbar-tools">
            <NotificationBell />
            <span className="local-badge">
              <i /> Ambiente local
            </span>
            <AccountMenu
              user={user}
              busy={busy}
              onLogout={logout}
              onNavigate={(section) => {
                setAccountSection(section);
                go(section === "connections" ? "sources" : "account");
              }}
            />
          </div>
        </header>
        <main className="content">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {detailId ? (
            <Suspense
              fallback={<div className="empty">Carregando detalhes…</div>}
            >
              <WidgetDetails
                key={detailId}
                id={detailId}
                onBack={() => go("dashboard")}
                onSources={() => go("sources")}
              />
            </Suspense>
          ) : tab === "account" ? (
            <Suspense fallback={<div className="empty">Carregando conta…</div>}>
              <AccountPage
                user={user}
                section={accountSection}
                onSection={(s) => {
                  setAccountSection(s);
                  if (s === "connections") go("sources");
                }}
                onUser={(u) => {
                  setUser(u);
                  applyPreferences(u.preferences);
                }}
              />
            </Suspense>
          ) : tab === "news" ? (
            <Suspense
              fallback={<div className="empty">Carregando notícias…</div>}
            >
              <NewsPage />
            </Suspense>
          ) : tab === "agenda" ? (
            <Suspense
              fallback={<div className="empty">Carregando agenda…</div>}
            >
              <Agenda
                initialDay={agendaDay}
                onConnections={() => {
                  go("sources");
                }}
              />
            </Suspense>
          ) : tab === "daily" ? (
            <Suspense
              fallback={<div className="empty">Preparando seu dia…</div>}
            >
              <MyDay onTasks={() => go("tasks")} />
            </Suspense>
          ) : tab === "sources" ? (
            <Suspense
              fallback={<div className="empty">Carregando fontes…</div>}
            >
              <Sources
                initialTab={
                  accountSection === "connections" ? "connections" : "sources"
                }
              />
            </Suspense>
          ) : tab === "dashboard" ? (
            <Suspense
              fallback={
                <div className="empty">
                  Carregando seu centro de informações…
                </div>
              }
            >
              <Intelligence user={user} />
            </Suspense>
          ) : tab === "imports" ? (
            <DataWorkspace />
          ) : tab === "reports" ? (
            <DataWorkspace />
          ) : (
            <Management
              key={tab + taskOpenVersion}
              section="tasks"
              initialTaskId={taskId}
            />
          )}
        </main>
        <footer>Command Center</footer>
      </div>
    </div>
  );
}
