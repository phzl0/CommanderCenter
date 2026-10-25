import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, send } from "./api";
import {
  catalogue,
  initialConfig,
  type Config,
  type Kind,
  type Widget,
  type WidgetInput,
} from "./intelligenceTypes";
import AccountConnection from "./AccountConnection";
import type { Source } from "./Sources";
type Company = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  verified: boolean;
};
type City = { label: string; latitude: number; longitude: number };
type Analysis = { id: string; name: string };
export default function WidgetEditor({
  widget,
  kind,
  onClose,
  onSaved,
}: {
  widget?: Widget;
  kind?: Kind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<WidgetInput>(() =>
      widget
        ? {
            title: widget.title,
            kind: widget.kind,
            visible: widget.visible,
            wide: widget.wide,
            config: { ...initialConfig, ...widget.config },
          }
        : {
            title:
              catalogue.find((c) => c.kind === kind)?.name || "Novo painel",
            kind: kind || "personal",
            visible: true,
            wide: false,
            config: { ...initialConfig },
          },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [analyses, setAnalyses] = useState<Analysis[]>([]),
    [columns, setColumns] = useState<{ name: string; numeric: boolean }[]>([]);
  const [sources, setSources] = useState<Source[]>([]),
    [search, setSearch] = useState(""),
    [matches, setMatches] = useState<Company[]>([]),
    [cities, setCities] = useState<City[]>([]),
    [searching, setSearching] = useState(false),
    [searchNote, setSearchNote] = useState("");
  useEffect(() => {
    api<Source[]>("/sources/bootstrap", { method: "POST" })
      .then((rows) => {
        setSources(rows);
        setForm((f) => ({
          ...f,
          config: {
            ...f.config,
            news_source_ids: f.config.news_source_ids.filter((id) =>
              rows.some((s) => s.id === id),
            ),
          },
        }));
      })
      .catch((e) => setError(e.message));
  }, []);
  async function searchCompany() {
    setSearching(true);
    setError("");
    setMatches([]);
    try {
      const r = await api<{ matches: Company[]; message: string }>(
        "/intelligence/company-search?q=" + encodeURIComponent(search),
      );
      setMatches(r.matches);
      setSearchNote(r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  async function searchCity() {
    setSearching(true);
    setError("");
    setCities([]);
    try {
      setCities(
        await api<City[]>(
          "/intelligence/city-search?q=" + encodeURIComponent(search),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  useEffect(() => {
    api<Analysis[]>("/analyses")
      .then(setAnalyses)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let live = true;
    setColumns([]);
    if (form.kind === "analysis" && form.config.analysis_id)
      api<{ columns: { name: string; numeric: boolean }[] }>(
        `/analyses/${form.config.analysis_id}/run`,
      )
        .then((r) => live && setColumns(r.columns))
        .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [form.kind, form.config.analysis_id]);
  const config = (next: Partial<Config>) =>
    setForm((f) => ({ ...f, config: { ...f.config, ...next } }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/intelligence/widgets" + (widget ? "/" + widget.id : ""),
        send(widget ? "PUT" : "POST", form),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal widget-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-editor-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">SEU PAINEL, SUAS ESCOLHAS</span>
            <h2 id="widget-editor-title">
              {widget ? "Configurar painel" : "Adicionar painel"}
            </h2>
          </div>
          <button
            aria-label="Fechar configuração"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={save}>
          <label>
            Título do painel
            <input
              autoFocus
              required
              maxLength={100}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Fonte de dados
              <select
                aria-label="Fonte de dados"
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as Kind;
                  setForm({
                    ...form,
                    kind,
                    title: catalogue.find((c) => c.kind === kind)!.name,
                    config: { ...initialConfig },
                  });
                }}
              >
                {catalogue.map((c) => (
                  <option key={c.kind} value={c.kind}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!["news", "weather"].includes(form.kind) && (
              <label>
                Tipo de gráfico
                <select
                  aria-label="Tipo de gráfico"
                  value={form.config.chart_type}
                  onChange={(e) =>
                    config({
                      chart_type: e.target.value as Config["chart_type"],
                    })
                  }
                >
                  <option value="area">Área</option>
                  <option value="line">Linha</option>
                  <option value="bar">Barras</option>
                </select>
              </label>
            )}
          </div>
          {form.kind === "github" && (
            <section>
              <AccountConnection
                provider="github"
                onRepository={(repository) => config({ repository })}
              />
              <label>
                Link do repositório ou dono/repositório
                <input
                  aria-label="Repositório GitHub"
                  placeholder="https://github.com/dono/repositorio"
                  maxLength={2048}
                  value={form.config.repository}
                  onChange={(e) =>
                    config({ repository: e.target.value.trim() })
                  }
                />
                <small className="muted">
                  Pode colar o link completo. Repositórios públicos também
                  funcionam sem conectar uma conta.
                </small>
              </label>
            </section>
          )}
          {form.kind === "teams" && (
            <section>
              <AccountConnection
                provider="microsoft"
                onList={(task_list_id) => config({ task_list_id })}
              />
              <label>
                Origem das tarefas
                <select
                  aria-label="Origem das tarefas"
                  value={form.config.task_source}
                  onChange={(e) =>
                    config({
                      task_source: e.target.value as "planner" | "todo",
                    })
                  }
                >
                  <option value="planner">Planner · atribuídas a mim</option>
                  <option value="todo">
                    Microsoft To Do · lista selecionada
                  </option>
                </select>
              </label>
              {form.config.task_source === "todo" && (
                <p className="muted">
                  {form.config.task_list_id
                    ? "Lista selecionada na conexão acima."
                    : "Conecte sua conta e selecione uma lista acima."}
                </p>
              )}
              <small className="muted">
                Leitura das tarefas atuais, sem alterar ou concluir itens.
                Planner exige conta corporativa ou escolar e permissão da
                organização.
              </small>
            </section>
          )}
          {form.kind === "news" && (
            <section className="news-widget-settings">
              <h3>Fontes do radar</h3>
              <p className="muted">
                Sem seleção, usa até seis fontes ativas. Configure sites e
                categorias na aba Fontes.
              </p>
              <div className="source-checkboxes">
                {sources.map((source) => (
                  <label className="checkbox-label" key={source.id}>
                    <input
                      type="checkbox"
                      checked={form.config.news_source_ids.includes(source.id)}
                      disabled={
                        !form.config.news_source_ids.includes(source.id) &&
                        form.config.news_source_ids.length >= 6
                      }
                      onChange={(e) =>
                        config({
                          news_source_ids: e.target.checked
                            ? [...form.config.news_source_ids, source.id]
                            : form.config.news_source_ids.filter(
                                (id) => id !== source.id,
                              ),
                        })
                      }
                    />
                    {source.name}
                    <small>{source.category}</small>
                  </label>
                ))}
              </div>
              <label>
                Categoria do radar
                <select
                  aria-label="Categoria do radar"
                  value={form.config.news_category}
                  onChange={(e) => config({ news_category: e.target.value })}
                >
                  <option value="">Todas as categorias</option>
                  {[...new Set(sources.map((s) => s.category))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Incluir palavras-chave
                <input
                  placeholder="empresa, time, jogo…"
                  value={form.config.news_keywords}
                  maxLength={300}
                  onChange={(e) => config({ news_keywords: e.target.value })}
                />
              </label>
              <label>
                Excluir palavras-chave
                <input
                  placeholder="termos separados por vírgula"
                  value={form.config.news_exclude}
                  maxLength={300}
                  onChange={(e) => config({ news_exclude: e.target.value })}
                />
              </label>
              <small className="muted">
                Termos separados por vírgula. Basta um termo de inclusão;
                qualquer termo de exclusão remove a notícia do recorte.
              </small>
            </section>
          )}
          {form.kind === "macro" && (
            <label>
              Indicador
              <select
                aria-label="Indicador"
                value={form.config.series}
                onChange={(e) =>
                  config({ series: e.target.value as Config["series"] })
                }
              >
                <option value="usd">Dólar comercial · venda</option>
                <option value="selic">Meta Selic</option>
                <option value="ipca">IPCA mensal · últimos 12 meses</option>
              </select>
            </label>
          )}
          {form.kind === "stock" && (
            <section className="stock-search">
              <label>
                Empresa, código ou link
                <input
                  aria-label="Empresa, código ou link"
                  placeholder="Nome, sigla ou link Yahoo/Google/TradingView"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={searching || search.trim().length < 2}
                onClick={searchCompany}
              >
                {searching ? "Pesquisando…" : "Buscar empresa"}
              </button>
              {searchNote && <p className="muted search-note">{searchNote}</p>}
              <div className="search-results">
                {matches.map((company) => (
                  <button
                    type="button"
                    key={company.symbol}
                    onClick={() => {
                      config({
                        symbol: company.symbol,
                        stock_name: company.name,
                        stock_exchange: company.exchange,
                        stock_currency: company.currency,
                      });
                      setMatches([]);
                      setSearchNote(
                        "Listagem selecionada. Confira os dados antes de salvar.",
                      );
                    }}
                  >
                    <strong>
                      {company.symbol} · {company.name}
                    </strong>
                    <small>
                      {company.exchange} · {company.currency}
                    </small>
                  </button>
                ))}
              </div>
              <label>
                Código no provedor
                <input
                  aria-label="Código no provedor"
                  value={form.config.symbol}
                  maxLength={30}
                  onChange={(e) =>
                    config({
                      symbol: e.target.value.toUpperCase().trim(),
                      stock_name: "",
                      stock_exchange: "",
                      stock_currency: "",
                    })
                  }
                />
              </label>
              {form.config.stock_name && (
                <div className="selected-source">
                  <strong>{form.config.stock_name}</strong>
                  <span>
                    {form.config.stock_exchange} · {form.config.stock_currency}
                  </span>
                </div>
              )}
              <small className="muted">
                Provedor único: Alpha Vantage. Busca e fechamentos diários
                exigem ALPHA_VANTAGE_API_KEY no .env local. Links são atalhos de
                pesquisa; não importam cotações do site colado.
              </small>
            </section>
          )}
          {form.kind === "weather" && (
            <section>
              <label>
                Cidade
                <input
                  aria-label="Cidade"
                  placeholder="São Paulo, Campinas…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={searching || search.trim().length < 2}
                onClick={searchCity}
              >
                {searching ? "Pesquisando…" : "Buscar cidade"}
              </button>
              <div className="search-results">
                {cities.map((city) => (
                  <button
                    type="button"
                    key={city.label + city.latitude}
                    onClick={() => {
                      config({
                        city: city.label,
                        latitude: city.latitude,
                        longitude: city.longitude,
                      });
                      setCities([]);
                    }}
                  >
                    {city.label}
                  </button>
                ))}
              </div>
              {form.config.city && (
                <div className="selected-source">
                  <strong>{form.config.city}</strong>
                  <span>Cidade selecionada</span>
                </div>
              )}
              <small className="muted">
                Condições e previsão via Open-Meteo. Nenhuma localização do
                navegador é solicitada.
              </small>
            </section>
          )}
          {form.kind === "personal" && (
            <label>
              Métrica
              <select
                aria-label="Métrica"
                value={form.config.metric}
                onChange={(e) =>
                  config({ metric: e.target.value as Config["metric"] })
                }
              >
                <option value="minutes">Minutos dedicados por dia</option>
                <option value="events">Quantidade de registros por dia</option>
              </select>
            </label>
          )}
          {form.kind === "analysis" && (
            <>
              <label>
                Análise salva
                <select
                  aria-label="Análise salva"
                  required
                  value={form.config.analysis_id || ""}
                  onChange={(e) =>
                    config({
                      analysis_id: e.target.value,
                      x_column: "",
                      y_column: "",
                    })
                  }
                >
                  <option value="">Selecione</option>
                  {analyses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Eixo horizontal
                  <select
                    aria-label="Eixo horizontal"
                    required
                    value={form.config.x_column}
                    onChange={(e) => config({ x_column: e.target.value })}
                  >
                    <option value="">Selecione a coluna</option>
                    {columns.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Coluna de valores
                  <select
                    aria-label="Coluna de valores"
                    required
                    value={form.config.y_column}
                    onChange={(e) => config({ y_column: e.target.value })}
                  >
                    <option value="">Selecione a coluna</option>
                    {columns.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Cálculo
                <select
                  aria-label="Cálculo do painel"
                  value={form.config.aggregation}
                  onChange={(e) =>
                    config({
                      aggregation: e.target.value as Config["aggregation"],
                    })
                  }
                >
                  <option value="sum">Soma</option>
                  <option value="mean">Média</option>
                  <option value="count">Contagem</option>
                </select>
              </label>
              <small className="muted">
                Use este painel também para acompanhar preços históricos,
                investimentos ou indicadores próprios a partir de uma planilha.
              </small>
            </>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar painel"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
