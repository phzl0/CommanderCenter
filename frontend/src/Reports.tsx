import { useEffect, useState } from "react";
import { Plus, FileText, Download, Trash2 } from "lucide-react";
import { api, send, download, timeLabel } from "./api";
import type { Analysis } from "./DataLab";
type Report = {
  id: string;
  title: string;
  format: string;
  created_at: string;
  parameters: { dataset: string };
};
export function Reports() {
  const [reports, setReports] = useState<Report[]>([]),
    [analyses, setAnalyses] = useState<Analysis[]>([]),
    [creating, setCreating] = useState(false),
    [dataset, setDataset] = useState("tasks"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function refresh() {
    const [r, a] = await Promise.all([
      api<Report[]>("/reports"),
      api<Analysis[]>("/analyses"),
    ]);
    setReports(r);
    setAnalyses(a);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        "/reports",
        send("POST", {
          title: f.get("title"),
          format: f.get("format"),
          dataset,
          analysis_id: dataset === "analysis" ? f.get("analysis_id") : null,
          date_from: dataset === "analysis" ? null : f.get("date_from") || null,
          date_to: dataset === "analysis" ? null : f.get("date_to") || null,
        }),
      );
      await refresh();
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(r: Report) {
    if (!window.confirm("Excluir este relatório e seu arquivo?")) return;
    setBusy(true);
    try {
      await api("/reports/" + r.id, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function get(r: Report) {
    setBusy(true);
    setError("");
    try {
      await download(
        "/reports/" + r.id + "/download",
        `relatorio-${r.id}.${r.format}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    tasks: "Tarefas",
    personal: "Atividades pessoais",
    finance: "Finanças pessoais",
    analysis: "Análise de planilha",
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INFORMAÇÃO PARA COMPARTILHAR</span>
          <h1>Relatórios</h1>
          <p>Gere resumos e leve seus dados com você.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setCreating(true);
            setError("");
          }}
        >
          <Plus size={17} /> Gerar relatório
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="format-cards">
        {[
          { title: "PDF", desc: "Resumo pronto para leitura", color: "orange" },
          {
            title: "EXCEL",
            desc: "Dados, resumo e agrupamentos",
            color: "green",
          },
          {
            title: "CSV",
            desc: "Dados para outras ferramentas",
            color: "blue",
          },
        ].map((f) => (
          <div className="panel format-card" key={f.title}>
            <span className={"stat-icon " + f.color}>
              <FileText size={20} />
            </span>
            <div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Seus relatórios</h2>
            <p>Arquivos gerados a partir dos seus dados</p>
          </div>
          <span className="badge">{reports.length} arquivos</span>
        </div>
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : reports.length === 0 ? (
          <div className="empty">
            <FileText size={36} />
            <h3>Seu primeiro relatório está a um passo</h3>
            <p>Escolha uma fonte de dados e o formato de exportação.</p>
          </div>
        ) : (
          reports.map((r) => (
            <article className="record" key={r.id}>
              <div className="record-icon">
                <FileText size={22} />
              </div>
              <div className="record-body">
                <h3>
                  {r.title}{" "}
                  <span className="badge">{r.format.toUpperCase()}</span>
                </h3>
                <p>
                  {labels[r.parameters.dataset]} · {timeLabel(r.created_at)}
                </p>
              </div>
              <button disabled={busy} onClick={() => get(r)}>
                <Download size={16} /> Baixar
              </button>
              <button
                disabled={busy}
                aria-label={"Excluir " + r.title}
                className="icon-button danger"
                onClick={() => remove(r)}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))
        )}
      </section>
      {creating && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
          >
            <h2 id="report-title">Gerar relatório</h2>
            <form onSubmit={create}>
              <label>
                Título
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue="Relatório de gestão"
                />
              </label>
              <div className="form-grid">
                <label>
                  Fonte
                  <select
                    value={dataset}
                    onChange={(e) => setDataset(e.target.value)}
                  >
                    {Object.entries(labels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Formato
                  <select name="format">
                    <option value="pdf">PDF</option>
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>
              </div>
              {dataset === "analysis" ? (
                <label>
                  Análise salva
                  <select name="analysis_id" required defaultValue="">
                    <option value="" disabled>
                      Selecione uma análise
                    </option>
                    {analyses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <p className="muted">
                    Período pela data de{" "}
                    {["activities", "personal", "finance"].includes(dataset)
                      ? dataset === "finance"
                        ? "lançamento"
                        : "realização da atividade"
                      : "criação do registro"}{" "}
                    (UTC para tarefas). Deixe vazio para incluir tudo.
                  </p>
                  <div className="form-grid">
                    <label>
                      De
                      <input type="date" name="date_from" />
                    </label>
                    <label>
                      Até
                      <input type="date" name="date_to" />
                    </label>
                  </div>
                </>
              )}
              <p className="muted">
                PDF: resumo e prévia de até 200 linhas e 8 colunas. CSV: dados
                filtrados. Excel: dados completos e cálculos em abas separadas.
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
                  onClick={() => setCreating(false)}
                >
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={
                    busy || (dataset === "analysis" && analyses.length === 0)
                  }
                >
                  {busy ? "Gerando…" : "Gerar relatório"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
