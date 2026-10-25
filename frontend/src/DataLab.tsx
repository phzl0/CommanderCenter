import { confirmAction } from "./feedback";
import { useEffect, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Play,
  Save,
  Trash2,
  Download,
  Plus,
  X,
  ArrowLeft,
  SlidersHorizontal,
} from "lucide-react";
import { api, send, download, timeLabel } from "./api";
type ImportItem = {
  id: string;
  original_name: string;
  format: string;
  size_bytes: number;
  rows: number;
  columns: string[];
  sheets: string[];
  options: { sheet: string | null };
  created_at: string;
};
type Filter = { column: string; operator: string; value: string };
type Aggregate = { column: string; operation: string };
type Config = {
  sheet: string | null;
  columns: string[];
  filters: Filter[];
  aggregations: Aggregate[];
  group_by: string[];
};
export type Analysis = {
  id: string;
  name: string;
  import_id: string;
  config: Config;
  created_at: string;
};
type Result = {
  columns: { name: string; type: string; numeric: boolean }[];
  rows: Record<string, unknown>[];
  total_rows: number;
  summary?: { column: string; operation: string; value: number | null }[];
  groups?: Record<string, unknown>[];
  total_groups?: number;
};
const initial: Config = {
  sheet: null,
  columns: [],
  filters: [],
  aggregations: [],
  group_by: [],
};
const operations: Record<string, string> = {
  sum: "Soma",
  mean: "Média",
  count: "Contagem",
};
const operators: Record<string, string> = {
  eq: "Igual a",
  ne: "Diferente de",
  contains: "Contém",
  gt: "Maior que",
  gte: "Maior ou igual",
  lt: "Menor que",
  lte: "Menor ou igual",
  is_empty: "Vazio",
  not_empty: "Preenchido",
};
function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} title={String(r[c] ?? "")}>
                  {String(r[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">Nenhuma linha para exibir.</div>
  );
}
export function DataLab() {
  const [fileSearch, setFileSearch] = useState("");
  const [filePage, setFilePage] = useState(1);
  const [imports, setImports] = useState<ImportItem[]>([]),
    [analyses, setAnalyses] = useState<Analysis[]>([]),
    [selected, setSelected] = useState<ImportItem | null>(null),
    [columns, setColumns] = useState<Result["columns"]>([]),
    [config, setConfig] = useState<Config>(initial),
    [result, setResult] = useState<Result | null>(null),
    [name, setName] = useState(""),
    [analysisId, setAnalysisId] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [loading, setLoading] = useState(true);
  async function refresh() {
    const [a, b] = await Promise.all([
      api<ImportItem[]>("/imports"),
      api<Analysis[]>("/analyses"),
    ]);
    setImports(a);
    setAnalyses(b);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const change = (next: Config) => {
    setConfig(next);
    setDirty(true);
    setNotice("");
  };
  async function open(item: ImportItem, analysis?: Analysis) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const c = analysis?.config || {
        ...initial,
        sheet: item.options.sheet || item.sheets[0] || null,
      };
      const p = await api<Result>(
        `/imports/${item.id}/preview${c.sheet ? "?sheet=" + encodeURIComponent(c.sheet) : ""}`,
      );
      setColumns(p.columns);
      setResult(
        analysis ? await api<Result>(`/analyses/${analysis.id}/run`) : p,
      );
      setSelected(item);
      setConfig(c);
      setName(analysis?.name || "Análise de " + item.original_name);
      setAnalysisId(analysis?.id || null);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sheet(value: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const p = await api<Result>(
        `/imports/${selected.id}/preview?sheet=${encodeURIComponent(value)}`,
      );
      setColumns(p.columns);
      setResult(p);
      change({ ...initial, sheet: value });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const row = await api<ImportItem>("/imports", {
        method: "POST",
        body: new FormData(form),
      });
      await refresh();
      setUploading(false);
      await open(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await api<Result>(
          `/imports/${selected.id}/analyze`,
          send("POST", config),
        ),
      );
      setNotice("Análise atualizada.");
      setDirty(!!analysisId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const a = await api<Analysis>(
        "/analyses" + (analysisId ? "/" + analysisId : ""),
        send(analysisId ? "PUT" : "POST", {
          name,
          import_id: selected.id,
          config,
        }),
      );
      setAnalysisId(a.id);
      setDirty(false);
      setNotice(
        "Configuração salva. Você pode reutilizá-la ou gerar um relatório.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportResult(format: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>(
        "/reports",
        send("POST", {
          title: name,
          format,
          dataset: "analysis",
          analysis_id: analysisId,
        }),
      );
      await download(
        `/reports/${r.id}/download`,
        `${name.replace(/[^\p{L}\p{N}_-]/gu, "_")}.${format}`,
      );
      setNotice("Relatório gerado e disponível também na aba Relatórios.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: ImportItem) {
    if (
      !(await confirmAction(
        "Excluir o original, suas análises e os relatórios relacionados? Esta ação não pode ser desfeita.",
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/imports/" + item.id, { method: "DELETE" });
      await refresh();
      if (selected?.id === item.id) setSelected(null);
      setNotice("Arquivo e registros relacionados excluídos.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filteredImports = imports.filter((i) =>
    i.original_name.toLowerCase().includes(fileSearch.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DADOS QUE FAZEM SENTIDO</span>
          <h1>Dados e arquivos</h1>
          <p>Importe, consulte e gere relatórios.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setUploading(true);
            setError("");
          }}
        >
          <Upload size={17} /> Importar arquivo
        </button>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      {selected ? (
        <>
          <button className="quiet back" onClick={() => setSelected(null)}>
            <ArrowLeft size={16} /> Todos os arquivos
          </button>
          <section className="panel analysis-panel">
            <div className="panel-heading">
              <div>
                <h2>{selected.original_name}</h2>
                <p>
                  {selected.rows.toLocaleString("pt-BR")} linhas ·{" "}
                  {(selected.size_bytes / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                disabled={busy}
                className="quiet"
                onClick={() =>
                  download(
                    "/imports/" + selected.id + "/download",
                    selected.original_name,
                  ).catch((e) => setError(e.message))
                }
              >
                <Download size={16} /> Original
              </button>
            </div>
            {selected.format === "pdf" && (
              <p className="muted">
                Texto por página. PDFs digitalizados ficam guardados, mas exigem
                OCR para análise.
              </p>
            )}
            <div className="analysis-config">
              <details className="analysis-options">
                <summary>Filtros e cálculos</summary>
                <div className="form-grid">
                  <label>
                    Nome da análise
                    <input
                      value={name}
                      maxLength={160}
                      onChange={(e) => {
                        setName(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </label>
                  {selected.sheets.length > 0 && (
                    <label>
                      Aba do Excel
                      <select
                        value={config.sheet || ""}
                        disabled={busy}
                        onChange={(e) => sheet(e.target.value)}
                      >
                        {selected.sheets.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <h3>
                  <SlidersHorizontal size={16} /> Colunas
                </h3>
                <div className="column-picker">
                  {columns.map((c) => (
                    <label key={c.name}>
                      <input
                        type="checkbox"
                        checked={
                          config.columns.length === 0 ||
                          config.columns.includes(c.name)
                        }
                        onChange={(e) => {
                          const current = config.columns.length
                            ? config.columns
                            : columns.map((c) => c.name);
                          const next = e.target.checked
                            ? [...current, c.name]
                            : current.filter((n) => n !== c.name);
                          if (next.length) change({ ...config, columns: next });
                        }}
                      />
                      {c.name}
                      <small>{c.numeric ? "123" : "ABC"}</small>
                    </label>
                  ))}
                </div>
                <div className="analysis-sections">
                  <section>
                    <div className="mini-heading">
                      <h3>Filtros</h3>
                      <button
                        disabled={
                          config.filters.length >= 20 || columns.length === 0
                        }
                        onClick={() =>
                          change({
                            ...config,
                            filters: [
                              ...config.filters,
                              {
                                column: columns[0].name,
                                operator: "eq",
                                value: "",
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> Adicionar
                      </button>
                    </div>
                    {config.filters.length === 0 && (
                      <p className="muted">
                        Todos os registros serão considerados.
                      </p>
                    )}
                    {config.filters.map((f, i) => (
                      <div className="filter-row" key={i}>
                        <select
                          aria-label="Coluna do filtro"
                          value={f.column}
                          onChange={(e) =>
                            change({
                              ...config,
                              filters: config.filters.map((x, n) =>
                                n === i ? { ...x, column: e.target.value } : x,
                              ),
                            })
                          }
                        >
                          {columns.map((c) => (
                            <option key={c.name}>{c.name}</option>
                          ))}
                        </select>
                        <select
                          aria-label="Operador"
                          value={f.operator}
                          onChange={(e) =>
                            change({
                              ...config,
                              filters: config.filters.map((x, n) =>
                                n === i
                                  ? { ...x, operator: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        >
                          {Object.entries(operators).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        {!["is_empty", "not_empty"].includes(f.operator) && (
                          <input
                            aria-label="Valor do filtro"
                            placeholder="Valor"
                            value={f.value}
                            onChange={(e) =>
                              change({
                                ...config,
                                filters: config.filters.map((x, n) =>
                                  n === i ? { ...x, value: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        )}
                        <button
                          aria-label="Remover filtro"
                          className="icon-button"
                          onClick={() =>
                            change({
                              ...config,
                              filters: config.filters.filter((_, n) => n !== i),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </section>
                  <section>
                    <div className="mini-heading">
                      <h3>Cálculos</h3>
                      <button
                        disabled={
                          config.aggregations.length >= 20 ||
                          columns.length === 0
                        }
                        onClick={() =>
                          change({
                            ...config,
                            aggregations: [
                              ...config.aggregations,
                              { column: columns[0].name, operation: "count" },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> Adicionar
                      </button>
                    </div>
                    {config.aggregations.length === 0 && (
                      <p className="muted">Adicione soma, média ou contagem.</p>
                    )}
                    {config.aggregations.map((a, i) => (
                      <div className="filter-row" key={i}>
                        <select
                          aria-label="Coluna do cálculo"
                          value={a.column}
                          onChange={(e) =>
                            change({
                              ...config,
                              aggregations: config.aggregations.map((x, n) =>
                                n === i ? { ...x, column: e.target.value } : x,
                              ),
                            })
                          }
                        >
                          {columns.map((c) => (
                            <option key={c.name}>{c.name}</option>
                          ))}
                        </select>
                        <select
                          aria-label="Cálculo"
                          value={a.operation}
                          onChange={(e) =>
                            change({
                              ...config,
                              aggregations: config.aggregations.map((x, n) =>
                                n === i
                                  ? { ...x, operation: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        >
                          {Object.entries(operations).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button
                          className="icon-button"
                          aria-label="Remover cálculo"
                          onClick={() =>
                            change({
                              ...config,
                              aggregations: config.aggregations.filter(
                                (_, n) => n !== i,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <label>
                      Agrupar cálculos por
                      <select
                        value={config.group_by[0] || ""}
                        onChange={(e) =>
                          change({
                            ...config,
                            group_by: e.target.value ? [e.target.value] : [],
                          })
                        }
                      >
                        <option value="">Sem agrupamento</option>
                        {columns.map((c) => (
                          <option key={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                  </section>
                </div>
              </details>
              <div className="analysis-actions">
                <button className="primary" disabled={busy} onClick={run}>
                  <Play size={16} />{" "}
                  {busy ? "Processando…" : "Executar análise"}
                </button>
                <button disabled={busy || !name.trim()} onClick={save}>
                  <Save size={16} /> Salvar configuração
                </button>
                {analysisId && !dirty && (
                  <div className="export-actions">
                    <span>Exportar:</span>
                    {["csv", "xlsx", "pdf"].map((f) => (
                      <button
                        key={f}
                        disabled={busy}
                        onClick={() => exportResult(f)}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <small className="muted">
                Prévia limitada a 50 linhas. Os cálculos consideram todas as
                linhas filtradas. Salve alterações antes de exportar.
              </small>
            </div>
          </section>
          {result && (
            <section className="panel results">
              <div className="panel-heading">
                <div>
                  <h2>Resultado</h2>
                  <p>
                    {result.total_rows.toLocaleString("pt-BR")} registros ·{" "}
                    {result.columns.length} colunas
                  </p>
                </div>
              </div>
              {result.summary && result.summary.length > 0 && (
                <div className="result-stats">
                  {result.summary.map((s, i) => (
                    <div key={i}>
                      <small>
                        {operations[s.operation]} · {s.column}
                      </small>
                      <strong>
                        {s.value === null
                          ? "—"
                          : s.value.toLocaleString("pt-BR", {
                              maximumFractionDigits: 4,
                            })}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              <DataTable rows={result.rows} />
              {!!result.groups?.length && (
                <>
                  <div className="panel-heading">
                    <div>
                      <h2>Agrupamentos</h2>
                      <p>
                        Exibindo até 100 de {result.total_groups} grupos. Excel
                        inclui todos.
                      </p>
                    </div>
                  </div>
                  <DataTable rows={result.groups} />
                </>
              )}
            </section>
          )}
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Arquivos importados</h2>
                <p>Originais guardados no seu espaço privado</p>
              </div>
              <span className="badge">{imports.length} arquivos</span>
            </div>
            <input
              aria-label="Buscar arquivos"
              placeholder="Buscar arquivo…"
              value={fileSearch}
              onChange={(e) => {
                setFileSearch(e.target.value);
                setFilePage(1);
              }}
            />
            {loading ? (
              <div className="empty">Carregando…</div>
            ) : imports.length === 0 ? (
              <div className="empty">
                <FileSpreadsheet size={36} />
                <h3>Seus arquivos</h3>
                <p>
                  Importe PDF, CSV, XLSX ou XLS de até 10 MB.
                  <br />
                  Até 50.000 linhas e 100 colunas por aba.
                </p>
                <button onClick={() => setUploading(true)}>
                  Importar primeiro arquivo
                </button>
              </div>
            ) : (
              filteredImports
                .slice((filePage - 1) * 8, filePage * 8)
                .map((item) => (
                  <article className="record" key={item.id}>
                    <div className="record-icon">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div className="record-body">
                      <h3>{item.original_name}</h3>
                      <p>
                        {item.rows.toLocaleString("pt-BR")} linhas ·{" "}
                        {item.columns.length} colunas ·{" "}
                        {timeLabel(item.created_at)}
                      </p>
                    </div>
                    <button disabled={busy} onClick={() => open(item)}>
                      Explorar
                    </button>
                    <button
                      aria-label={"Excluir " + item.original_name}
                      className="icon-button danger"
                      disabled={busy}
                      onClick={() => remove(item)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))
            )}
          </section>
          {filteredImports.length > 8 && (
            <div className="pagination">
              <button
                disabled={filePage <= 1}
                onClick={() => setFilePage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                {filePage} / {Math.ceil(filteredImports.length / 8)}
              </span>
              <button
                disabled={filePage * 8 >= filteredImports.length}
                onClick={() => setFilePage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
          <section className="panel saved-analyses">
            <div className="panel-heading">
              <div>
                <h2>Análises salvas</h2>
                <p>Retome filtros e cálculos sem começar de novo</p>
              </div>
            </div>
            {analyses.length === 0 ? (
              <div className="empty compact">
                Suas análises salvas aparecerão aqui.
              </div>
            ) : (
              analyses.map((a) => (
                <article className="record" key={a.id}>
                  <div className="record-body">
                    <h3>{a.name}</h3>
                    <p>
                      {imports.find((i) => i.id === a.import_id)?.original_name}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => {
                      const i = imports.find((i) => i.id === a.import_id);
                      if (i) open(i, a);
                    }}
                  >
                    Abrir análise
                  </button>
                </article>
              ))
            )}
          </section>
        </>
      )}
      {uploading && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
          >
            <h2 id="upload-title">Importar arquivo</h2>
            <p className="muted">
              O original será guardado até você excluí-lo.
            </p>
            <form onSubmit={upload}>
              <label className="file-drop">
                <Upload size={28} />
                <span>Escolha um PDF, CSV ou Excel</span>
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.csv,.xlsx,.xls"
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Codificação CSV
                  <select name="encoding">
                    <option value="utf-8-sig">UTF-8</option>
                    <option value="latin-1">Latin-1</option>
                  </select>
                </label>
                <label>
                  Separador CSV
                  <select name="separator">
                    <option value="">Detectar automaticamente</option>
                    <option value=";">Ponto e vírgula</option>
                    <option value=",">Vírgula</option>
                    <option value={"\t"}>Tabulação</option>
                    <option value="|">Barra vertical</option>
                  </select>
                </label>
              </div>
              <label>
                Separador decimal CSV
                <select name="decimal">
                  <option value=".">Ponto (1234.56)</option>
                  <option value=",">Vírgula (1234,56)</option>
                </select>
              </label>
              <p className="muted">
                No Excel, a primeira aba é aberta inicialmente. Você poderá
                selecionar outra após importar.
              </p>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setUploading(false)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Importando…" : "Importar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
