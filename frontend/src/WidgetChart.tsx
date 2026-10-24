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
import type { ChartData, Config } from "./intelligenceTypes";
const axisLabel = (s: unknown) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? s.slice(8, 10) + "/" + s.slice(5, 7)
    : String(s).slice(0, 14);
export default function WidgetChart({
  data,
  type,
  id,
}: {
  data: NonNullable<ChartData["chart"]>;
  type: Config["chart_type"];
  id: string;
}) {
  const common = {
    data: data.points,
    margin: { top: 15, right: 12, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="#23344d" strokeDasharray="3 5" vertical={false} />
      <XAxis
        dataKey="label"
        tickFormatter={axisLabel}
        tick={{ fill: "#8ea4c3", fontSize: 10 }}
        axisLine={false}
        tickLine={false}
        minTickGap={24}
      />
      <YAxis
        width={43}
        tick={{ fill: "#8ea4c3", fontSize: 10 }}
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
          background: "#111e33",
          border: "1px solid #314966",
          borderRadius: 8,
          color: "#e5efff",
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
      aria-label={`Gráfico com ${data.points.length} pontos. Séries: ${data.series.map((s) => s.name).join(", ")}.`}
    >
      <ResponsiveContainer width="100%" height={205} minWidth={0}>
        {type === "bar" ? (
          <BarChart {...common}>
            {axes}
            {data.series.map((s) => (
              <Bar
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
            {data.series.map((s) => (
              <Line
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
              {data.series.map((s, i) => (
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
            {data.series.map((s, i) => (
              <Area
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
        {data.series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
