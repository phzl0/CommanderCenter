import { getPreferences, formatInstant } from "./userPreferences";
import { confirmAction, detailUrl } from "./feedback";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Github,
  Newspaper,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  AlertCircle,
  Database,
  CloudSun,
  ListTodo,
} from "lucide-react";
import { api, send, type User } from "./api";
import {
  catalogue,
  formatValue,
  type Widget,
  type WidgetInput,
  type Kind,
  type ChartData,
} from "./intelligenceTypes";
import WidgetChart from "./WidgetChart";
import WidgetEditor from "./WidgetEditor";
import QuickRecords from "./QuickRecords";
import NewsCarousel from "./NewsCarousel";
import WeatherView from "./WeatherView";
const icons = {
  tasks: Check,
  personal: Activity,
  finance: Coins,
  github: Github,
  news: Newspaper,
  macro: Gauge,
  stock: TrendingUp,
  analysis: BarChart3,
  weather: CloudSun,
  teams: ListTodo,
};
function WidgetCard({
  widget,
  days,
  version,
  onEdit,
  onRecord,
}: {
  widget: Widget;
  days: number;
  version: number;
  onEdit: () => void;
  onRecord: () => void;
}) {
  const [data, setData] = useState<ChartData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<ChartData>(
      `/intelligence/widgets/${widget.id}/data?days=${days}&refresh=${refresh > 0}`,
    )
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [widget.id, widget.config, days, version, refresh]);
  const Icon = icons[widget.kind],
    hasData = data?.status === "ok",
    hasPoints = !!data?.chart?.points.length;
  return (
    <section
      className={
        "panel intelligence-card kind-" +
        widget.kind +
        " " +
        (widget.kind === "news" ? "news-card" : "")
      }
      aria-label={widget.title}
    >
      <div className="widget-heading">
        <div className={"widget-symbol " + widget.kind}>
          <Icon size={18} />
        </div>
        <div>
          <h2>{widget.title}</h2>
          <span>{catalogue.find((c) => c.kind === widget.kind)?.tag}</span>
        </div>
        <div className="widget-controls">
          <button
            aria-label={"Atualizar " + widget.title}
            title="Atualizar fonte"
            className="icon-button"
            disabled={loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw size={14} className={loading ? "spinning" : ""} />
          </button>
          <button
            aria-label={"Configurar " + widget.title}
            title="Configurar painel"
            className="icon-button"
            onClick={onEdit}
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="chart-loading">
          <div />
          <div />
          <span>Consultando seus indicadores…</span>
        </div>
      ) : error ? (
        <div className="widget-empty error-state">
          <AlertCircle size={24} />
          <p>{error}</p>
          <button onClick={() => setRefresh((v) => v + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {data?.kpis && (
            <div className="widget-kpis">
              {data.kpis.map((k, i) => (
                <div key={k.label}>
                  <span>{k.label}</span>
                  <strong
                    className={
                      widget.kind === "finance" &&
                      i === 2 &&
                      Number(k.value) < 0
                        ? "negative"
                        : ""
                    }
                  >
                    {formatValue(k.value, k.unit)}
                  </strong>
                </div>
              ))}
            </div>
          )}
          {widget.kind === "news" && hasData && data?.items?.length ? (
            <NewsCarousel items={data.items} />
          ) : widget.kind === "weather" && hasData && data?.weather ? (
            <WeatherView weather={data.weather} city={data.city} />
          ) : widget.kind !== "news" && hasData && hasPoints && data.chart ? (
            <WidgetChart
              data={data.chart}
              type={widget.config.chart_type}
              kind={widget.kind}
              id={widget.id}
              height={175}
            />
          ) : (
            <div
              className={
                "widget-empty " +
                (data?.status === "unavailable" ? "error-state" : "")
              }
            >
              <Icon size={25} />
              <h3>
                {data?.status === "needs_config"
                  ? "Conecte sua fonte"
                  : data?.status === "unavailable"
                    ? "Fonte indisponível"
                    : "Seu próximo dado começa aqui"}
              </h3>
              <p>
                {data?.status === "empty"
                  ? "Sem registros neste período."
                  : data?.message}
              </p>
              {data?.status !== "unavailable" && (
                <button
                  onClick={
                    widget.kind === "personal" || widget.kind === "finance"
                      ? onRecord
                      : onEdit
                  }
                >
                  {widget.kind === "personal" || widget.kind === "finance"
                    ? "Registrar dados"
                    : "Configurar painel"}
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}
          {data?.distribution && hasData && (
            <div className="task-distribution">
              {data.distribution.map((s, i) => (
                <div key={s.name}>
                  <span>
                    <i
                      style={{
                        background: ["#86b4e8", "#789ac4", "#9cdbc1"][i],
                      }}
                    />
                    {s.name}
                  </span>
                  <strong>{s.value}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="widget-provenance">
            <span>
              <i className={hasData ? "live-dot" : "idle-dot"} />
              {data?.source || "Dados do seu espaço"}
            </span>
            {data?.as_of && (
              <time title={formatInstant(data.as_of)}>
                {new Date(data.as_of).toLocaleTimeString("pt-BR", {
                  timeZone: getPreferences().timezone,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {data.cached ? " · cache" : ""}
              </time>
            )}
            {data?.link && (
              <a
                href={data.link}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir fonte"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          {data?.data_date && (
            <p className="data-date">Último dado: {data.data_date}</p>
          )}
        </>
      )}
      <div className="card-detail-actions">
        {widget.kind === "github" && (
          <button className="quiet" onClick={onEdit}>
            <Github size={13} />
            {widget.config.repository
              ? "Selecionar repositório"
              : "Conectar GitHub"}
          </button>
        )}
        {widget.kind === "teams" && (
          <button className="quiet" onClick={onEdit}>
            Conectar Microsoft
          </button>
        )}
        <a href={detailUrl(widget.id)}>
          Ver detalhes <ChevronRight size={14} />
        </a>
        <a
          href={detailUrl(widget.id)}
          target="_blank"
          rel="noreferrer"
          aria-label={"Abrir em nova aba: " + widget.title}
        >
          <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
export default function Intelligence({}: { user: User }) {
  const [widgets, setWidgets] = useState<Widget[]>([]),
    [days, setDays] = useState(30),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [customizing, setCustomizing] = useState(false),
    [editor, setEditor] = useState<{ widget?: Widget; kind?: Kind } | null>(
      null,
    ),
    [recording, setRecording] = useState(false),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await api<{
      days: number;
      card_limit: number;
      widgets: Widget[];
    }>("/intelligence/bootstrap", { method: "POST" });
    setWidgets(r.widgets);
    setDays(r.days);

    setLoaded(true);
  }
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    const changed = () => {
      load()
        .then(() => setVersion((v) => v + 1))
        .catch((e) => setError(e.message));
    };
    window.addEventListener("cc-data-changed", changed);
    return () => window.removeEventListener("cc-data-changed", changed);
  }, []);
  const active = widgets.filter((w) => w.visible && w.kind !== "news");
  const visible = active.slice(0, 5);
  async function saveWidget(w: Widget, patch: Partial<WidgetInput>) {
    setBusy(true);
    setError("");
    try {
      const { title, kind, config, wide, visible } = w;
      const next = await api<Widget>(
        "/intelligence/widgets/" + w.id,
        send("PUT", { title, kind, config, wide, visible, ...patch }),
      );
      setWidgets((rows) => rows.map((r) => (r.id === next.id ? next : r)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(index: number, delta: number) {
    const movable = widgets.filter((w) => w.kind !== "news");
    [movable[index], movable[index + delta]] = [
      movable[index + delta],
      movable[index],
    ];
    let cursor = 0;
    const next = widgets.map((w) =>
      w.kind === "news" ? w : movable[cursor++],
    );
    setBusy(true);
    try {
      await api(
        "/intelligence/order",
        send("POST", { ids: next.map((w) => w.id) }),
      );
      setWidgets(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(w: Widget) {
    if (
      !(await confirmAction(
        "Remover este painel? Seus registros e arquivos serão mantidos.",
      ))
    )
      return;
    setBusy(true);
    try {
      await api("/intelligence/widgets/" + w.id, { method: "DELETE" });
      setWidgets((rows) => rows.filter((r) => r.id !== w.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function period(value: number) {
    setBusy(true);
    try {
      await api("/intelligence/settings", send("PUT", { days: value }));
      setDays(value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="intelligence-heading">
        <h1>Visão geral</h1>
        <div className="dashboard-actions">
          <div
            className="segment"
            role="group"
            aria-label="Período dos gráficos"
          >
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={days === d ? "active" : ""}
                disabled={busy}
                onClick={() => period(d)}
              >
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => setRecording(true)}>
            <Plus size={16} />
            Registrar dado
          </button>
          <button className="primary" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={16} />
            Personalizar
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!loaded ? (
        <div className="empty">Preparando seu radar…</div>
      ) : visible.length === 0 ? (
        <div className="panel empty">
          <BarChart3 size={35} />
          <h3>Escolha o que você quer acompanhar</h3>
          <p>
            Seu painel pode combinar dados pessoais, mercado e desenvolvimento.
          </p>
          <button className="primary" onClick={() => setCustomizing(true)}>
            Adicionar meu primeiro painel
          </button>
        </div>
      ) : (
        <div className={"intelligence-grid compact-grid"}>
          {visible.map((w) => (
            <WidgetCard
              key={w.id}
              widget={w}
              days={days}
              version={version}
              onEdit={() => setEditor({ widget: w })}
              onRecord={() => setRecording(true)}
            />
          ))}
        </div>
      )}
      {customizing && (
        <div className="modal-backdrop">
          <section
            className="modal customization-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customization-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">MONTE SEU CENTRO DE INFORMAÇÕES</span>
                <h2 id="customization-title">Personalizar visão geral</h2>
              </div>
              <button
                aria-label="Fechar personalização"
                className="icon-button"
                onClick={() => setCustomizing(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              Até cinco cards. Notícias ficam na aba própria.
            </p>
            <div className="widget-management">
              {widgets
                .filter((w) => w.kind !== "news")
                .map((w, i) => {
                  const Icon = icons[w.kind];
                  return (
                    <div key={w.id}>
                      <Icon size={17} />
                      <span>
                        <strong>{w.title}</strong>
                        <small>
                          {catalogue.find((c) => c.kind === w.kind)?.name}
                          {w.visible && !visible.some((v) => v.id === w.id)
                            ? " · Fora do limite atual"
                            : ""}
                        </small>
                      </span>
                      <button
                        className="icon-button"
                        aria-label={
                          (w.visible ? "Ocultar " : "Mostrar ") + w.title
                        }
                        title={w.visible ? "Ocultar" : "Mostrar"}
                        disabled={busy || (!w.visible && active.length >= 5)}
                        onClick={() => saveWidget(w, { visible: !w.visible })}
                      >
                        {w.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Subir " + w.title}
                        disabled={busy || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Descer " + w.title}
                        disabled={
                          busy ||
                          i ===
                            widgets.filter((w) => w.kind !== "news").length - 1
                        }
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={"Editar " + w.title}
                        onClick={() => {
                          setCustomizing(false);
                          setEditor({ widget: w });
                        }}
                      >
                        <Settings2 size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        aria-label={"Remover " + w.title}
                        disabled={busy}
                        onClick={() => remove(w)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
            </div>
            <h3 className="catalogue-title">Adicionar uma fonte</h3>
            <div className="widget-catalogue">
              {catalogue
                .filter((c) => c.kind !== "news")
                .map((c) => {
                  const Icon = icons[c.kind];
                  return (
                    <button
                      key={c.kind}
                      disabled={
                        busy || active.length >= 5 || widgets.length >= 12
                      }
                      onClick={() => {
                        setCustomizing(false);
                        setEditor({ kind: c.kind });
                      }}
                    >
                      <span className={"catalogue-icon " + c.kind}>
                        <Icon size={20} />
                      </span>
                      <strong>{c.name}</strong>
                      <p>{c.description}</p>
                      <small>
                        {c.tag}
                        <Plus size={13} />
                      </small>
                    </button>
                  );
                })}
            </div>
          </section>
        </div>
      )}
      {editor && (
        <WidgetEditor
          widget={editor.widget}
          kind={editor.kind}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load()
              .then(() => setVersion((v) => v + 1))
              .catch((e) => setError(e.message));
          }}
        />
      )}
      {recording && (
        <QuickRecords
          onClose={() => setRecording(false)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </>
  );
}
