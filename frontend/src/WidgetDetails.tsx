import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Settings2,
  Lightbulb,
  Database,
  AlertCircle,
} from "lucide-react";
import { api } from "./api";
import {
  catalogue,
  formatValue,
  type ChartData,
  type Widget,
} from "./intelligenceTypes";
import WidgetChart from "./WidgetChart";
import WidgetEditor from "./WidgetEditor";
import NewsFeed from "./NewsFeed";
import WeatherView from "./WeatherView";
const suggestions: Record<string, string[]> = {
  personal: [
    "Compare períodos de mesma duração para acompanhar a regularidade.",
    "Registre atividades com nomes consistentes para facilitar sua leitura.",
  ],
  finance: [
    "Confira se todos os lançamentos do período foram registrados.",
    "O resultado mostra receitas menos despesas, sem saldo inicial.",
  ],
  tasks: [
    "Compare conclusões com a situação atual das tarefas.",
    "Uma tarefa reaberta e concluída novamente gera outro evento no histórico.",
  ],
  github: [
    "Use os commits como indicador de atividade, não como medida isolada de qualidade.",
    "O recorte considera a branch padrão e até 100 commits.",
  ],
  stock: [
    "Confira o código da listagem, sua região/bolsa, moeda e data do fechamento.",
    "Variações históricas são descritivas; não são indicação de compra ou venda.",
  ],
  macro: [
    "Observe a unidade e a frequência de divulgação do indicador.",
    "O IPCA tem janela mensal própria, independente do seletor de dias.",
  ],
  analysis: [
    "Confira filtros, agrupamentos e o tipo das colunas na análise original.",
    "O gráfico mostra até 100 grupos; o relatório Excel pode incluir o resultado completo.",
  ],
};
export default function WidgetDetails({
  id,
  onBack,
  onSources,
}: {
  id: string;
  onBack: () => void;
  onSources: () => void;
}) {
  const [widget, setWidget] = useState<Widget | null>(null),
    [data, setData] = useState<ChartData | null>(null),
    [days, setDays] = useState(30),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<Widget>("/intelligence/widgets/" + encodeURIComponent(id)),
      api<ChartData>(
        `/intelligence/widgets/${encodeURIComponent(id)}/data?days=${days}`,
      ),
    ])
      .then(([w, d]) => {
        if (live) {
          setWidget(w);
          setData(d);
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id, days, version]);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(
        await api<ChartData>(
          `/intelligence/widgets/${encodeURIComponent(id)}/data?days=${days}&refresh=true`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button className="quiet detail-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Voltar à visão geral
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">UM OLHAR MAIS COMPLETO</span>
          <h1>{widget?.title || "Detalhes do painel"}</h1>
          <p>
            {catalogue.find((c) => c.kind === widget?.kind)?.description ||
              "Informações, origem dos dados e acompanhamento."}
          </p>
        </div>
        <div className="dashboard-actions">
          <button disabled={loading} onClick={refresh}>
            <RefreshCw size={15} />
            Atualizar
          </button>
          <button
            className="primary"
            disabled={!widget}
            onClick={() => setEditing(true)}
          >
            <Settings2 size={15} />
            Configurar
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {widget && (
        <div className="detail-metadata">
          <span>
            <Database size={14} />
            {data?.source || "Fonte não informada"}
          </span>
          {data?.as_of && (
            <span>
              Consulta: {new Date(data.as_of).toLocaleString("pt-BR")}
            </span>
          )}
          {data?.data_date && <span>Último dado: {data.data_date}</span>}
          <div
            className="segment"
            role="group"
            aria-label="Período dos detalhes"
          >
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={days === d ? "active" : ""}
                onClick={() => setDays(d)}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <section className="panel empty">Carregando detalhes…</section>
      ) : data && widget ? (
        <>
          <section className="panel detail-primary">
            {!!data.kpis?.length && (
              <div className="detail-kpis">
                {data.kpis.map((k) => (
                  <div key={k.label}>
                    <span>{k.label}</span>
                    <strong>{formatValue(k.value, k.unit)}</strong>
                  </div>
                ))}
              </div>
            )}
            {data.status === "unavailable" || data.status === "needs_config" ? (
              <div className="widget-empty">
                <AlertCircle size={28} />
                <h3>
                  {data.status === "needs_config"
                    ? "Configure sua fonte"
                    : "Fonte indisponível"}
                </h3>
                <p>{data.message}</p>
                <button onClick={() => setEditing(true)}>
                  Configurar painel
                </button>
              </div>
            ) : widget.kind === "news" ? (
              data.items?.length ? (
                <NewsFeed items={data.items} />
              ) : (
                <div className="empty">
                  Nenhuma notícia para os filtros selecionados.
                </div>
              )
            ) : widget.kind === "weather" && data.weather ? (
              <WeatherView weather={data.weather} city={data.city} detailed />
            ) : data.chart?.points.length ? (
              <WidgetChart
                data={data.chart}
                type={widget.config.chart_type}
                id={"detail-" + id}
                height={320}
              />
            ) : (
              <div className="empty">Sem dados neste recorte.</div>
            )}
            {data.message && (
              <p className="detail-source-note">{data.message}</p>
            )}
            {widget.kind === "stock" && widget.config.stock_name && (
              <p className="detail-source-note">
                {widget.config.stock_name} · {widget.config.stock_exchange} ·{" "}
                {widget.config.stock_currency}
              </p>
            )}
            {data.source_errors?.map((e) => (
              <div className="error source-warning" key={e.source}>
                {e.source}: {e.message}
              </div>
            ))}
          </section>
          <div className="detail-secondary-grid">
            <section className="panel detail-suggestions">
              <h2>
                <Lightbulb size={18} />
                Sugestões de acompanhamento
              </h2>
              <small>Orientações fixas do sistema, sem IA.</small>
              <ul>
                {(
                  data.suggestions ||
                  suggestions[widget.kind] || [
                    "Verifique a origem, a data e a configuração deste indicador.",
                  ]
                ).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {widget.kind === "news" && (
                <button onClick={onSources}>Gerenciar fontes e leituras</button>
              )}
              {data.link && (
                <a
                  className="quiet"
                  href={data.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir fonte original <ExternalLink size={14} />
                </a>
              )}
            </section>
            <section className="panel detail-configuration">
              <h2>Sobre este painel</h2>
              <dl>
                <dt>Tipo</dt>
                <dd>{catalogue.find((c) => c.kind === widget.kind)?.name}</dd>
                <dt>Visualização</dt>
                <dd>
                  {widget.kind === "news"
                    ? "Manchetes e imagens"
                    : widget.kind === "weather"
                      ? "Condições e previsão"
                      : widget.config.chart_type === "area"
                        ? "Área"
                        : widget.config.chart_type === "bar"
                          ? "Barras"
                          : "Linha"}
                </dd>
                <dt>Origem</dt>
                <dd>{data.source || "Dados locais"}</dd>
                <dt>Atualização</dt>
                <dd>
                  {data.cached
                    ? "Consulta armazenada em cache"
                    : "Consulta atual"}{" "}
                  · fontes externas podem ter atraso
                </dd>
              </dl>
            </section>
          </div>
          {widget.kind !== "news" && data.chart && (
            <section className="panel detail-data">
              <div className="panel-heading">
                <div>
                  <h2>Dados do gráfico</h2>
                  <p>{data.chart.points.length} pontos no recorte exibido</p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data / categoria</th>
                      {data.chart.series.map((s) => (
                        <th key={s.key}>{s.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.chart.points.map((point, i) => (
                      <tr key={i}>
                        <td>{point.label}</td>
                        {data.chart!.series.map((s) => (
                          <td key={s.key}>
                            {typeof point[s.key] === "number"
                              ? Number(point[s.key]).toLocaleString("pt-BR", {
                                  maximumFractionDigits: 6,
                                })
                              : String(point[s.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
      {editing && widget && (
        <WidgetEditor
          widget={widget}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
