import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { useDashboard } from "@/api/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { UpstreamStatusDot } from "@/routes/upstreams";
import { formatRelative } from "@/lib/format";

const DecisionsAreaChart = lazy(() => import("@/components/charts/decisions-area-chart"));
const ShadowRateChart = lazy(() => import("@/components/charts/shadow-rate-chart"));

export function DashboardPage() {
  const dashboard = useDashboard();

  if (dashboard.isPending) return <Skeleton className="h-96 w-full" />;
  if (dashboard.isError)
    return <p className="text-sm text-destructive">Failed to load dashboard.</p>;

  const data = dashboard.data;
  const today = data.decisions_by_day[data.decisions_by_day.length - 1];
  const totalToday = today ? today.allow + today.deny + today.shadow_deny + today.needs_approval : 0;
  const shadowDenies7d = data.decisions_by_day.reduce((sum, d) => sum + d.shadow_deny, 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Decisions overview and shadow cut-over signals." />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <Stat label="decisions today" value={String(totalToday)} />
        <Stat
          label="shadow denies · 7d"
          value={String(shadowDenies7d)}
          accent={shadowDenies7d > 0 ? "text-warning" : "text-success"}
        />
        <Link to="/approvals">
          <Stat
            label="approvals pending"
            value={String(data.approvals.pending)}
            accent={data.approvals.pending > 0 ? "text-warning" : undefined}
          />
        </Link>
        <Stat
          label="median time-to-resolve"
          value={
            data.approvals.median_resolution_minutes != null
              ? `${data.approvals.median_resolution_minutes}m`
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Decisions by verdict · 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-52 w-full" />}>
              <DecisionsAreaChart data={data.decisions_by_day} />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shadow-deny rate per role — the cut-over chart</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-52 w-full" />}>
              <ShadowRateChart series={data.shadow_rates} />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top denied tools</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Tool</TableHead>
                  <TableHead className="text-right pr-4">Denials</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_denied_tools.map((row) => (
                  <TableRow key={row.tool}>
                    <TableCell className="pl-4 font-mono text-xs">{row.tool}</TableCell>
                    <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                      {row.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top deny reasons</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Reason</TableHead>
                  <TableHead className="text-right pr-4">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_deny_reasons.map((row) => (
                  <TableRow key={row.reason}>
                    <TableCell className="max-w-96 truncate pl-4 font-mono text-xs">
                      {row.reason}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                      {row.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Upstream health</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {data.upstream_health.map((upstream) => (
            <div
              key={upstream.name}
              className="flex items-center gap-3 rounded-md border bg-background/40 px-3 py-2"
            >
              <span className="font-mono text-sm">{upstream.name}</span>
              <UpstreamStatusDot status={upstream.status} />
              <span className="text-xs text-muted-foreground">
                tools/list {formatRelative(upstream.last_tools_list_at)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
