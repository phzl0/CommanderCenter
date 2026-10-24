export type Kind =
  | "tasks"
  | "personal"
  | "finance"
  | "github"
  | "news"
  | "macro"
  | "stock"
  | "analysis";
export type Config = {
  chart_type: "area" | "line" | "bar";
  repository: string;
  feed: "ibge" | "economia" | "politica";
  series: "usd" | "selic" | "ipca";
  symbol: string;
  analysis_id: string | null;
  x_column: string;
  y_column: string;
  aggregation: "sum" | "mean" | "count";
  metric: "minutes" | "events";
};
export type Widget = {
  id: string;
  title: string;
  kind: Kind;
  visible: boolean;
  wide: boolean;
  position: number;
  config: Config;
};
export type WidgetInput = Omit<Widget, "id" | "position">;
export type ChartData = {
  status: "ok" | "empty" | "needs_config" | "unavailable";
  source?: string;
  message?: string;
  as_of?: string | null;
  data_date?: string;
  cached?: boolean;
  chart?: {
    points: Record<string, string | number | null>[];
    series: { key: string; name: string; color: string }[];
    unit: string;
  };
  kpis?: { label: string; value: number | null; unit?: string }[];
  distribution?: { name: string; value: number }[];
  items?: { title: string; url: string; date: string }[];
  link?: string;
};
export const initialConfig: Config = {
  chart_type: "area",
  repository: "",
  feed: "ibge",
  series: "usd",
  symbol: "",
  analysis_id: null,
  x_column: "",
  y_column: "",
  aggregation: "sum",
  metric: "minutes",
};
export const catalogue: {
  kind: Kind;
  name: string;
  description: string;
  tag: string;
}[] = [
  {
    kind: "personal",
    name: "Atividade pessoal",
    description: "Tempo dedicado a estudo, exercício e outras atividades.",
    tag: "Seus registros",
  },
  {
    kind: "finance",
    name: "Finanças pessoais",
    description: "Receitas, despesas e resultado do período em reais.",
    tag: "Seus registros",
  },
  {
    kind: "tasks",
    name: "Evolução das tarefas",
    description: "Conclusões ao longo do tempo e situação atual.",
    tag: "Dados locais",
  },
  {
    kind: "github",
    name: "Repositório GitHub",
    description: "Commits, estrelas e issues de um repositório público.",
    tag: "API pública",
  },
  {
    kind: "news",
    name: "Radar de notícias",
    description: "Manchetes e volume recebido de economia e política.",
    tag: "IBGE / Agência Brasil",
  },
  {
    kind: "macro",
    name: "Indicadores econômicos",
    description: "Dólar comercial, meta Selic ou IPCA mensal.",
    tag: "Banco Central",
  },
  {
    kind: "stock",
    name: "Ações de empresas",
    description: "Histórico de fechamento diário de um ativo.",
    tag: "Requer chave local",
  },
  {
    kind: "analysis",
    name: "Gráfico de planilha",
    description: "Transforme uma análise salva em um painel.",
    tag: "Seus arquivos",
  },
];
export const formatValue = (n: number | null, unit = "") =>
  n === null
    ? "—"
    : unit === "R$"
      ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) +
        (unit ? " " + unit : "");
