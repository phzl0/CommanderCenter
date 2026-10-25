import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { ChartData, Config, Kind } from "./intelligenceTypes";
const palettes: Partial<Record<Kind, string[]>> = {
  personal: ["#9cdbc1"],
  tasks: ["#93b9ef"],
  finance: ["#8ed7c1", "#8baed5"],
  github: ["#9ac8ed"],
  macro: ["#88b5ec"],
  stock: ["#abd0ee"],
  analysis: ["#92b3db"],
  teams: ["#a0bdf0"],
};
const axisLabel = (s: unknown) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? s.slice(8, 10) + "/" + s.slice(5, 7)
    : String(s).slice(0, 14);
export default function WidgetChart({
  data,
  type,
  id,
  height = 205,
  kind,
}: {
  data: NonNullable<ChartData["chart"]>;
  type: Config["chart_type"];
  id: string;
  height?: number;
  kind?: Kind;
}) {
  const colors = kind ? palettes[kind] : undefined;
  const series = data.series.map((s, i) => ({
    ...s,
    color: colors?.[i] || s.color,
  }));
  const common = {
    data: data.points,
    margin: { top: 15, right: 12, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="#283c55" strokeDasharray="3 5" vertical={false} />
      <XAxis
        dataKey="label"
        tickFormatter={axisLabel}
        tick={{ fill: "#a9bdd4", fontSize: 10 }}
        axisLine={false}
        tickLine={false}
        minTickGap={24}
      />
      <YAxis
        width={43}
        tick={{ fill: "#a9bdd4", fontSize: 10 }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(n) =>
          Number(n).toLocaleString("pt-BR", {
            notation: "compact",
            maximumFractionDigits: 1,
          })
        }
      />
      <Tooltip
        contentStyle={{
          background: "#0e1b2e",
          border: "1px solid #3d5673",
          borderRadius: 8,
          color: "#eeeeee",
          fontSize: 12,
        }}
        labelFormatter={(v) => axisLabel(v)}
        formatter={(v) => [
          typeof v === "number"
            ? v.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
            : String(v),
        ]}
      />
    </>
  );
  return (
    <div
      className="widget-chart"
      role="img"
      aria-label={`Gráfico com ${data.points.length} pontos. Séries: ${series.map((s) => s.name).join(", ")}.`}
    >
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        {type === "bar" ? (
          <BarChart {...common}>
            {axes}
            {series.map((s) => (
              <Bar
                isAnimationActive={false}
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
            ))}
          </BarChart>
        ) : type === "line" ? (
          <LineChart {...common}>
            {axes}
            {series.map((s) => (
              <Line
                isAnimationActive={false}
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        ) : (
          <AreaChart {...common}>
            <defs>
              {series.map((s, i) => (
                <linearGradient
                  key={s.key}
                  id={`gradient-${id}-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            {axes}
            {series.map((s, i) => (
              <Area
                isAnimationActive={false}
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                fill={`url(#gradient-${id}-${i})`}
                strokeWidth={2.3}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
