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
            <label>
              Tipo de gráfico
              <select
                aria-label="Tipo de gráfico"
                value={form.config.chart_type}
                onChange={(e) =>
                  config({ chart_type: e.target.value as Config["chart_type"] })
                }
              >
                <option value="area">Área</option>
                <option value="line">Linha</option>
                <option value="bar">Barras</option>
              </select>
            </label>
          </div>
          {form.kind === "github" && (
            <label>
              Repositório público
              <input
                aria-label="Repositório público"
                placeholder="dono/repositorio"
                maxLength={140}
                value={form.config.repository}
                onChange={(e) => config({ repository: e.target.value.trim() })}
              />
              <small className="muted">
                Sem token. Até 100 commits da branch padrão no período. Esta
                conexão é independente do GitHub conectado ao ChatGPT.
              </small>
            </label>
          )}
          {form.kind === "news" && (
            <label>
              Fonte de notícias
              <select
                aria-label="Fonte de notícias"
                value={form.config.feed}
                onChange={(e) =>
                  config({ feed: e.target.value as Config["feed"] })
                }
              >
                <option value="ibge">IBGE · Economia e indicadores</option>
                <option value="economia">Agência Brasil · Economia</option>
                <option value="politica">Agência Brasil · Política</option>
              </select>
              <small className="muted">
                A contagem representa apenas os itens recebidos do feed, sem
                avaliação de sentimento.
              </small>
            </label>
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
            <label>
              Símbolo da empresa
              <input
                aria-label="Símbolo da empresa"
                placeholder="IBM"
                maxLength={30}
                value={form.config.symbol}
                onChange={(e) =>
                  config({ symbol: e.target.value.toUpperCase().trim() })
                }
              />
              <small className="muted">
                Fechamentos diários via Alpha Vantage. Exige
                ALPHA_VANTAGE_API_KEY no .env local e está sujeito ao limite do
                provedor. Não insira a chave neste campo.
              </small>
            </label>
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
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.wide}
              onChange={(e) => setForm({ ...form, wide: e.target.checked })}
            />{" "}
            Ocupar a largura inteira
          </label>
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
