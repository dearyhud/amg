import {
  Area,
  AreaChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/format";

interface DayPoint {
  date: string;
  allow: number;
  deny: number;
  shadow_deny: number;
  needs_approval: number;
}

export function DecisionsAreaChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDate(`${d}T00:00:00Z`)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="allow"
          stackId="d"
          stroke="var(--chart-allow)"
          fill="var(--chart-allow)"
          fillOpacity={0.25}
          name="allow"
        />
        <Area
          type="monotone"
          dataKey="shadow_deny"
          stackId="d"
          stroke="var(--chart-shadow-deny)"
          fill="var(--chart-shadow-deny)"
          fillOpacity={0.35}
          name="shadow deny"
        />
        <Area
          type="monotone"
          dataKey="deny"
          stackId="d"
          stroke="var(--chart-deny)"
          fill="var(--chart-deny)"
          fillOpacity={0.35}
          name="deny"
        />
        <Area
          type="monotone"
          dataKey="needs_approval"
          stackId="d"
          stroke="var(--chart-needs-approval)"
          fill="var(--chart-needs-approval)"
          fillOpacity={0.35}
          name="needs approval"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default DecisionsAreaChart;
