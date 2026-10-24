import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Activity as ActivityIcon,
  FileSpreadsheet,
  Files,
  LogOut,
  Command,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Menu,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import {
  api,
  send,
  dateLabel,
  timeLabel,
  type User,
  type Task,
  type Activity,
} from "./api";
import { Management } from "./Management";
import { DataLab } from "./DataLab";
import { Reports } from "./Reports";
type Tab =
  "dashboard" | "projects" | "tasks" | "activities" | "imports" | "reports";
const nav = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "projects", label: "Projetos", icon: FolderKanban },
  { id: "tasks", label: "Tarefas", icon: ListTodo },
  { id: "activities", label: "Atividades", icon: ActivityIcon },
  { id: "imports", label: "Dados e análises", icon: FileSpreadsheet },
  { id: "reports", label: "Relatórios", icon: Files },
] as const;
function Dashboard({ go, user }: { go: (t: Tab) => void; user: User }) {
  const [data, setData] = useState<{
      counts: Record<string, number>;
      upcoming_tasks: Task[];
      recent_activities: Activity[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU CENTRO DE OPERAÇÕES</span>
          <h1>
            Visão geral<span className="title-dot">.</span>
          </h1>
          <p>
            Olá, {user.name.split(" ")[0]}. Transforme informação em próximas
            ações.
          </p>
        </div>
        <span className="date-chip">
          {new Date().toLocaleDateString("pt-BR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="stats">
        {[
          {
            key: "active_projects",
            title: "Projetos ativos",
            icon: FolderKanban,
            color: "blue",
            tab: "projects",
          },
          {
            key: "pending_tasks",
            title: "Tarefas em aberto",
            icon: Clock,
            color: "purple",
            tab: "tasks",
          },
          {
            key: "overdue_tasks",
            title: "Tarefas atrasadas",
            icon: AlertCircle,
            color: "orange",
            tab: "tasks",
          },
          {
            key: "completed_tasks",
            title: "Tarefas concluídas",
            icon: CheckCircle2,
            color: "green",
            tab: "tasks",
          },
        ].map((c) => (
          <button
            className="stat panel"
            key={c.key}
            onClick={() => go(c.tab as Tab)}
          >
            <div>
              <span className={"stat-icon " + c.color}>
                <c.icon size={19} />
              </span>
              <ArrowUpRight size={16} />
            </div>
            <strong>{data ? data.counts[c.key] : "—"}</strong>
            <span>{c.title}</span>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Próximas entregas</h2>
              <p>Suas tarefas em aberto, por prazo</p>
            </div>
            <button className="quiet" onClick={() => go("tasks")}>
              Ver todas <ChevronRight size={16} />
            </button>
          </div>
          {!data ? (
            <div className="empty">Carregando…</div>
          ) : data.upcoming_tasks.length === 0 ? (
            <div className="empty">
              <ListTodo size={30} />
              <h3>Espaço para sua próxima entrega</h3>
              <p>Adicione tarefas para acompanhar os prazos por aqui.</p>
              <button onClick={() => go("tasks")}>Organizar tarefas</button>
            </div>
          ) : (
            data.upcoming_tasks.map((t) => (
              <div className="upcoming" key={t.id}>
                <span className={"priority-dot " + t.priority} />
                <div>
                  <h3>{t.title}</h3>
                  <p>{dateLabel(t.due_date)}</p>
                </div>
                <span className={"badge " + t.status}>
                  {t.status === "in_progress" ? "Em andamento" : "Pendente"}
                </span>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Atividade recente</h2>
              <p>Um histórico das suas ações</p>
            </div>
            <ActivityIcon size={18} />
          </div>
          {!data ? (
            <div className="empty">Carregando…</div>
          ) : data.recent_activities.length === 0 ? (
            <div className="empty">
              <ActivityIcon size={30} />
              <h3>Seu histórico começa aqui</h3>
              <p>Registre uma atividade ou conclua uma tarefa.</p>
            </div>
          ) : (
            <div className="timeline">
              {data.recent_activities.map((a) => (
                <article key={a.id}>
                  <i />
                  <div>
                    <p>{a.description}</p>
                    <span>{timeLabel(a.occurred_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="insight-banner">
        <div className="banner-icon">
          <FileSpreadsheet size={28} />
        </div>
        <div>
          <span className="eyebrow">DOS DADOS À DECISÃO</span>
          <h2>Suas planilhas, com uma nova perspectiva.</h2>
          <p>Importe, filtre e analise seus dados. Exporte o que importa.</p>
        </div>
        <button onClick={() => go("imports")}>
          Explorar dados <ArrowUpRight size={17} />
        </button>
      </section>
    </>
  );
}
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
            <span className="eyebrow">CLAREZA PARA AVANÇAR</span>
            <h1>
              Todo o seu trabalho.
              <br />
              Uma visão mais clara.
            </h1>
            <p>
              Projetos, prioridades e dados conectados
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
        <span className="nav-label">WORKSPACE</span>
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
            <span>Workspace</span>
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
            <Dashboard go={go} user={user} />
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
          <small>MVP 1</small>
        </footer>
      </div>
    </div>
  );
}
