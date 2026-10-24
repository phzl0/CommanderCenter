import { useEffect, useState, lazy, Suspense } from "react";
import {
  LayoutDashboard,
  ListTodo,
  FileSpreadsheet,
  Files,
  LogOut,
  Command,
  ArrowUpRight,
  Menu,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { api, send, type User } from "./api";
import { Management } from "./Management";
import { DataLab } from "./DataLab";
import { Reports } from "./Reports";
const Intelligence = lazy(() => import("./Intelligence"));
type Tab = "dashboard" | "tasks" | "imports" | "reports";
const nav = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "tasks", label: "Tarefas", icon: ListTodo },
  { id: "imports", label: "Dados e análises", icon: FileSpreadsheet },
  { id: "reports", label: "Relatórios", icon: Files },
] as const;
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [tab, setTab] = useState<Tab>("dashboard"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setChecking(false));
    const expired = () => {
      setUser(null);
      setError("Sua sessão expirou. Entre novamente.");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      setUser(
        await api<User>(
          "/auth/login",
          send("POST", { email: f.get("email"), password: f.get("password") }),
        ),
      );
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
              <Command size={24} />
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
    setTab(t);
    setMenu(false);
    setError("");
  };
  return (
    <div className="app">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="brand">
          <span>
            <Command size={22} />
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
          <div className="user-card">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="icon-button"
              title="Sair"
              aria-label="Sair"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
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
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </div>
          <span className="local-badge">
            <i /> Ambiente local
          </span>
        </header>
        <main className="content">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {tab === "dashboard" ? (
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
            <DataLab />
          ) : tab === "reports" ? (
            <Reports />
          ) : (
            <Management key={tab} section={tab} />
          )}
        </main>
        <footer>
          Command Center <span>Seu próximo passo começa com clareza.</span>
          <small>INTELLIGENCE WORKSPACE</small>
        </footer>
      </div>
    </div>
  );
}
