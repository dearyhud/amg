import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/format";

interface ActivityPoint {
  date: string;
  allow: number;
  deny: number;
  shadow_deny: number;
  needs_approval: number;
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDate(`${d}T00:00:00Z`)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          interval={6}
        />
        <YAxis
          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "color-mix(in srgb, var(--secondary) 40%, transparent)" }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Bar dataKey="allow" stackId="d" fill="var(--chart-allow)" name="allow" />
        <Bar dataKey="shadow_deny" stackId="d" fill="var(--chart-shadow-deny)" name="shadow deny" />
        <Bar dataKey="deny" stackId="d" fill="var(--chart-deny)" name="deny" />
        <Bar
          dataKey="needs_approval"
          stackId="d"
          fill="var(--chart-needs-approval)"
          name="needs approval"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ActivityChart;
