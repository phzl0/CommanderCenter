import { useEffect, useState } from "react";
import { RefreshCw, Settings2, X } from "lucide-react";
import { api, send } from "./api";
import { formatInstant } from "./userPreferences";
import WidgetChart from "./WidgetChart";
import { formatValue, type ChartData } from "./intelligenceTypes";
type Stock = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  time: string | null;
  status: string;
};
type Indicator = ChartData & { frequency?: string; period_note?: string };
type Overview = {
  stocks: Stock[];
  indicators: Record<string, Indicator>;
  has_key: boolean;
  as_of: string;
  cached: boolean;
  notice: string;
  market_source: string;
};
const titles: Record<string, string> = {
  selic: "Taxa Selic",
  usd: "Dólar comercial",
  pib: "PIB do Brasil",
  ipca: "Inflação · IPCA",
};
export default function Economy() {
  const [data, setData] = useState<Overview | null>(null),
    [days, setDays] = useState(90),
    [interval, setInterval] = useState("day"),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [key, setKey] = useState(""),
    [saving, setSaving] = useState(false),
    [selected, setSelected] = useState<Stock | null>(null),
    [range, setRange] = useState("1mo"),
    [resolution, setResolution] = useState("1d"),
    [history, setHistory] = useState<ChartData | null>(null),
    [historyError, setHistoryError] = useState("");
  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    api<Overview>(
      `/economy/overview?days=${days}&interval=${interval}&refresh=${version > 0}`,
    )
      .then((r) => live && setData(r))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [days, interval, version]);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    setHistory(null);
    setHistoryError("");
    api<ChartData>(
      `/economy/stocks/${selected.symbol}/history?range=${range}&interval=${resolution}`,
    )
      .then((r) => live && setHistory(r))
      .catch((e) => live && setHistoryError(e.message));
    return () => {
      live = false;
    };
  }, [selected?.symbol, range, resolution]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/economy/settings", send("PUT", { api_key: key }));
      setKey("");
      setSettings(false);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Economia</h1>
          <p>Mercado brasileiro e indicadores oficiais.</p>
        </div>
        <div className="agenda-actions">
          <button
            onClick={() => {
              setSettings((s) => !s);
              setKey("");
            }}
          >
            <Settings2 size={15} />
            Configurar cotações
          </button>
          <button disabled={busy} onClick={() => setVersion((v) => v + 1)}>
            <RefreshCw size={15} />
            {busy ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {settings && (
        <section className="panel market-settings">
          <h2>Cobertura das ações</h2>
          <p>
            Sem chave: PETR4, VALE3, ITUB4 e MGLU3. Para os outros ativos e
            históricos, use seu plano brapi.
          </p>
          <form onSubmit={save}>
            <label>
              Chave brapi
              <input
                aria-label="Chave brapi"
                type="password"
                autoComplete="off"
                maxLength={500}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  data?.has_key
                    ? "Chave já salva; vazio remove"
                    : "Cole sua chave"
                }
              />
            </label>
            <small>
              Armazenada criptografada na sua conta; não será exibida novamente.
            </small>
            <div className="agenda-actions">
              <a
                href="https://brapi.dev/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Obter chave no provedor
              </a>
              <button className="primary" disabled={saving}>
                Salvar chave
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel market-panel">
        <div className="panel-heading">
          <div>
            <h2>Mapa de ações</h2>
            <p>
              Variação frente ao fechamento anterior · verde: alta · vermelho:
              baixa.
            </p>
          </div>
          {data && (
            <small>
              Consulta: {formatInstant(data.as_of)}
              {data.cached ? " · cache" : ""}
            </small>
          )}
        </div>
        {data ? (
          <>
            <div className="market-grid">
              {data.stocks.map((s) => (
                <button
                  key={s.symbol}
                  aria-label={`${s.symbol}: ${s.change === null ? "sem cotação" : s.change.toFixed(2) + "%"}`}
                  className={
                    "market-tile " +
                    (s.change === null
                      ? "unavailable"
                      : s.change > 0
                        ? "gain"
                        : s.change < 0
                          ? "loss"
                          : "flat")
                  }
                  onClick={() => setSelected(s)}
                >
                  <strong>{s.symbol}</strong>
                  <span>{s.name}</span>
                  <b>
                    {s.change === null
                      ? "—"
                      : (s.change > 0 ? "+" : "") +
                        s.change.toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2,
                        }) +
                        "%"}
                  </b>
                  <small>
                    {s.price === null
                      ? s.status === "needs_key"
                        ? "Requer chave"
                        : "Indisponível"
                      : s.price.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                  </small>
                  {s.time && <time>{formatInstant(s.time)}</time>}
                </button>
              ))}
            </div>
            <p className="market-footnote">{data.notice}</p>
          </>
        ) : (
          <div className="empty">Consultando mercado…</div>
        )}
      </section>
      <div className="economy-toolbar">
        <h2>Indicadores</h2>
        <div className="agenda-actions">
          <select
            aria-label="Período econômico"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[
              [7, "7 dias"],
              [30, "1 mês"],
              [90, "3 meses"],
              [365, "1 ano"],
            ].map(([n, label]) => (
              <option key={n} value={n}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Agrupamento econômico"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            <option value="day">Dias</option>
            <option value="week">Semanas</option>
            <option value="month">Meses</option>
          </select>
        </div>
      </div>
      <div className="economy-indicators">
        {Object.entries(titles).map(([code, title]) => {
          const indicator = data?.indicators[code];
          return (
            <section className="panel economic-card" key={code}>
              <div className="panel-heading">
                <h2>{title}</h2>
                <small>{indicator?.frequency}</small>
              </div>
              {indicator?.kpis?.[0] && (
                <strong className="economic-value">
                  {formatValue(indicator.kpis[0].value, indicator.kpis[0].unit)}
                </strong>
              )}
              {indicator?.chart?.points.length ? (
                <WidgetChart
                  data={indicator.chart}
                  type="line"
                  kind="macro"
                  id={"economy-" + code}
                  height={175}
                />
              ) : (
                <p className="empty compact">
                  {indicator?.message || "Aguardando dados…"}
                </p>
              )}
              <div className="economic-source">
                <span>{indicator?.source}</span>
                <span>
                  {indicator?.data_date && "Referência: " + indicator.data_date}
                </span>
              </div>
              {indicator?.period_note && (
                <small className="economic-note">{indicator.period_note}</small>
              )}
              {code === "pib" && (
                <small className="economic-note">
                  Trimestre contra trimestre anterior, com ajuste sazonal. Não
                  há PIB por hora ou mês.
                </small>
              )}
            </section>
          );
        })}
      </div>
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal stock-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-title"
          >
            <div className="dialog-heading">
              <div>
                <h2 id="stock-title">
                  {selected.symbol} · {selected.name}
                </h2>
                <p>
                  {selected.time
                    ? "Cotação: " + formatInstant(selected.time)
                    : "Horário não disponível"}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar ação"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="agenda-actions">
              <select
                aria-label="Período da ação"
                value={range}
                onChange={(e) => setRange(e.target.value)}
              >
                {["1d", "5d", "1mo", "3mo", "1y"].map((v, i) => (
                  <option value={v} key={v}>
                    {["1 dia", "5 dias", "1 mês", "3 meses", "1 ano"][i]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Intervalo da ação"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              >
                <option value="1h">Horas</option>
                <option value="1d">Dias</option>
                <option value="1mo">Meses</option>
              </select>
            </div>
            {historyError && <p className="error">{historyError}</p>}
            {history?.chart?.points.length ? (
              <WidgetChart
                data={history.chart}
                type="line"
                id={"stock-" + selected.symbol}
                kind="stock"
                height={240}
              />
            ) : (
              <p className="empty">
                {history?.message || "Consultando histórico…"}
              </p>
            )}
            <small>{history?.message} Origem: brapi.</small>
          </section>
        </div>
      )}
    </>
  );
}
