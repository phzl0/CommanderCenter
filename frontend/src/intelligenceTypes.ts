export type Kind =
  | "tasks"
  | "personal"
  | "finance"
  | "github"
  | "news"
  | "macro"
  | "stock"
  | "analysis"
  | "weather"
  | "teams";
export type Config = {
  task_source: "planner" | "todo";
  task_list_id: string;
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
  news_source_ids: string[];
  news_category: string;
  news_keywords: string;
  news_exclude: string;
  stock_name: string;
  stock_exchange: string;
  stock_currency: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
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
  items?: import("./NewsFeed").NewsItem[];
  task_items?: {
    id: string;
    title: string;
    completed: boolean;
    due: string;
    progress: number;
  }[];
  source_errors?: { source: string; message: string }[];
  suggestions?: string[];
  city?: string;
  weather?: {
    temperature: number | null;
    feels_like: number | null;
    code: number | null;
    condition: string;
    wind: number | null;
    time: string;
    timezone: string;
    days: {
      date: string;
      code: number;
      condition: string;
      max: number;
      min: number;
      rain: number | null;
    }[];
  };
  link?: string;
};
export const initialConfig: Config = {
  task_source: "planner",
  task_list_id: "",
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
  news_source_ids: [],
  news_category: "",
  news_keywords: "",
  news_exclude: "",
  stock_name: "",
  stock_exchange: "",
  stock_currency: "",
  city: "",
  latitude: null,
  longitude: null,
};
export const catalogue: {
  kind: Kind;
  name: string;
  description: string;
  tag: string;
}[] = [
  {
    kind: "teams",
    name: "Tarefas do Teams",
    description: "Tarefas atribuídas do Planner e listas do Microsoft To Do.",
    tag: "Microsoft 365 · somente leitura",
  },
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
    description: "Manchetes, imagens e leitura organizada por tema.",
    tag: "Suas fontes de notícias",
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
  {
    kind: "weather",
    name: "Clima e previsão",
    description: "Condições atuais e previsão de sete dias para sua cidade.",
    tag: "Open-Meteo",
  },
];
export const formatValue = (n: number | null, unit = "") =>
  n === null
    ? "—"
    : unit === "R$"
      ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) +
        (unit ? " " + unit : "");
