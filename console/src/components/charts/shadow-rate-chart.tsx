import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/format";

interface ShadowSeries {
  role: string;
  points: { date: string; denies: number; total: number }[];
}

const LINE_COLORS = ["var(--warning)", "#ea9a97", "#c4a7e7"];

/*
 * The cut-over chart: per-role would-be-deny rate. Promotion is safe when
 * a role's line sits at zero.
 */
export function ShadowRateChart({ series }: { series: ShadowSeries[] }) {
  if (series.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No roles in shadow mode — everything is enforcing.
      </p>
    );
  }

  const dates = series[0]!.points.map((p) => p.date);
  const data = dates.map((date, i) => {
    const row: Record<string, number | string> = { date };
    for (const s of series) {
      const point = s.points[i];
      row[s.role] = point && point.total > 0 ? Math.round((point.denies / point.total) * 1000) / 10 : 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDate(`${d}T00:00:00Z`)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          unit="%"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value: number) => `${value}%`}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-mono)" }} />
        {series.map((s, i) => (
          <Line
            key={s.role}
            type="monotone"
            dataKey={s.role}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default ShadowRateChart;
