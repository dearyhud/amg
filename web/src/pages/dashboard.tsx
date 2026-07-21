import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowUpRight, Info, XCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/panel"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { DECISION_STYLES } from "@/lib/decision"
import type { Agent, AuditEvent, Policy, Upstream } from "@/lib/types"

type Tone = "neutral" | "good" | "warning" | "critical"

const TONE: Record<Tone, { dot: string; text: string; word: string }> = {
  neutral: { dot: "bg-muted-foreground", text: "text-muted-foreground", word: "" },
  good: { dot: "bg-status-emerald", text: "text-status-emerald", word: "nominal" },
  warning: { dot: "bg-status-amber", text: "text-status-amber", word: "elevated" },
  critical: { dot: "bg-status-red", text: "text-status-red", word: "critical" },
}

// A 12-point de-emphasis line with the current bucket picked out — the
// stat-tile "trend" contract: shape over exact values, current bucket in ink.
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 72
  const h = 22
  const max = Math.max(...data, 0.0001)
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - (v / max) * (h - 4) - 2
    return [x, y] as const
  })
  const last = points[points.length - 1]

  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground/30"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} className="fill-foreground" />
    </svg>
  )
}

function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  trend,
}: {
  label: string
  value: string
  sub?: string
  tone?: Tone
  trend?: number[]
}) {
  const t = TONE[tone]
  return (
    <div className="border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{label}</span>
        {tone !== "neutral" && (
          <span className={cn("flex shrink-0 items-center gap-1 font-mono text-[0.65rem] tracking-widest uppercase", t.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
            {t.word}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold">{value}</span>
        {trend && <Sparkline data={trend} />}
      </div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

interface AttentionItem {
  severity: "critical" | "warning" | "info"
  label: string
  detail: string
  to: string
}

const SEVERITY_ICON = { critical: XCircle, warning: AlertTriangle, info: Info }
const SEVERITY_COLOR = {
  critical: "text-status-red",
  warning: "text-status-amber",
  info: "text-muted-foreground",
}

// Splits chronological events into `buckets` equal windows and returns the
// hit-rate of `predicate` in each — the raw series a sparkline draws.
function bucketRate(events: AuditEvent[], predicate: (e: AuditEvent) => boolean, buckets = 12): number[] {
  if (events.length === 0) return []
  const chronological = [...events].reverse()
  const size = Math.max(1, Math.ceil(chronological.length / buckets))
  const rates: number[] = []
  for (let i = 0; i < chronological.length; i += size) {
    const slice = chronological.slice(i, i + size)
    rates.push(slice.filter(predicate).length / slice.length)
  }
  return rates
}

export function DashboardPage() {
  const auditQuery = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ events: AuditEvent[] }>("/audit"),
  })
  const agentsQuery = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ agents: Agent[] }>("/agents"),
  })
  const upstreamsQuery = useQuery({
    queryKey: ["upstreams"],
    queryFn: () => api<{ upstreams: Upstream[] }>("/upstreams"),
  })
  const policiesQuery = useQuery({
    queryKey: ["policies"],
    queryFn: () => api<{ policies: Policy[] }>("/policies"),
  })

  const isLoading =
    auditQuery.isLoading || agentsQuery.isLoading || upstreamsQuery.isLoading || policiesQuery.isLoading

  const events = auditQuery.data?.events ?? []
  const total = events.length
  const denyCount = events.filter((e) => e.decision === "deny").length
  const errorCount = events.filter((e) => e.decision === "error").length
  const denyRate = total ? (denyCount / total) * 100 : 0
  const errorRate = total ? (errorCount / total) * 100 : 0
  const latencies = events.map((e) => e.latency_ms).filter((n): n is number => n != null)
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null

  const denyTrend = bucketRate(events, (e) => e.decision === "deny")
  const errorTrend = bucketRate(events, (e) => e.decision === "error")

  const denyTone: Tone = denyRate === 0 ? "neutral" : denyRate > 20 ? "critical" : denyRate > 5 ? "warning" : "neutral"
  const errorTone: Tone = errorRate === 0 ? "good" : errorRate > 10 ? "critical" : "warning"

  const agents = agentsQuery.data?.agents ?? []
  const upstreams = upstreamsQuery.data?.upstreams ?? []
  const policies = policiesQuery.data?.policies ?? []

  const activeUpstreams = upstreams.filter((u) => u.status === "active")
  const upstreamsTone: Tone = upstreams.length === 0 ? "neutral" : activeUpstreams.length === upstreams.length ? "good" : "critical"

  const activeAgents = agents.filter((a) => a.status === "active")
  const activePolicies = policies.filter((p) => p.status === "active")

  const attention: AttentionItem[] = []

  for (const u of upstreams) {
    if (u.status !== "active") {
      attention.push({
        severity: "critical",
        label: `${u.slug} is disabled`,
        detail: "Every rule that targets it is unreachable until it's re-enabled.",
        to: `/upstreams/${u.id}`,
      })
    } else if (u.kind === "mcp_http" && u.oauth_connected === false) {
      attention.push({
        severity: "warning",
        label: `${u.slug} needs OAuth reconnect`,
        detail: "Calls routed to it will be denied as upstream_disabled until it's connected.",
        to: `/upstreams/${u.id}`,
      })
    }
  }

  for (const p of policies) {
    if (p.status === "active" && (p.bound_agents ?? 0) === 0) {
      attention.push({
        severity: "info",
        label: `${p.name} isn't bound to any agent`,
        detail: "Dead weight, or a role that's still waiting on its first agent.",
        to: `/policies/${p.id}`,
      })
    }
  }

  if (errorCount > 0) {
    attention.push({
      severity: "critical",
      label: `${errorCount} upstream error${errorCount === 1 ? "" : "s"} in the last ${total} calls`,
      detail: "The policy allowed these — the upstream itself failed to serve them.",
      to: "/audit",
    })
  }

  if (denyTone !== "neutral") {
    attention.push({
      severity: denyTone === "critical" ? "critical" : "warning",
      label: `Blocked-call rate at ${denyRate.toFixed(0)}%`,
      detail: "Worth a look: a misconfigured agent, a stale policy, or a scope probe.",
      to: "/audit?decision=deny",
    })
  }

  attention.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })

  const recent = events.slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Dashboard</h1>
        {total > 0 && (
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            last {total} call{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Blocked calls"
              value={total === 0 ? "—" : `${denyRate.toFixed(0)}%`}
              sub={total === 0 ? "no activity yet" : `${denyCount} of ${total} — out-of-policy calls stopped cold`}
              tone={denyTone}
              trend={denyTrend}
            />
            <StatTile
              label="Upstream errors"
              value={total === 0 ? "—" : `${errorRate.toFixed(0)}%`}
              sub={total === 0 ? "no activity yet" : `${errorCount} of ${total} — allowed calls the upstream failed`}
              tone={errorTone}
              trend={errorTrend}
            />
            <StatTile
              label="Avg latency"
              value={avgLatency != null ? `${avgLatency}ms` : "—"}
              sub="across the last window"
            />
            <StatTile
              label="Upstreams online"
              value={`${activeUpstreams.length}/${upstreams.length}`}
              tone={upstreamsTone}
              sub={upstreams.length === 0 ? "none registered" : undefined}
            />
          </div>

          <Panel title="Needs attention">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-status-emerald" aria-hidden />
                All systems nominal — no disabled upstreams, no error spikes, no orphaned policies.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((item, i) => {
                  const Icon = SEVERITY_ICON[item.severity]
                  return (
                    <li key={i}>
                      <Link to={item.to} className="flex items-start gap-2.5 py-2 text-sm hover:text-primary">
                        <Icon className={cn("mt-0.5 size-4 shrink-0", SEVERITY_COLOR[item.severity])} />
                        <span className="flex-1">
                          <span className="font-medium">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.detail}</span>
                        </span>
                        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Fleet">
              <ul className="divide-y divide-border text-sm">
                <li className="flex items-center justify-between py-2">
                  <Link to="/agents" className="hover:text-primary">
                    Agents
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {activeAgents.length}/{agents.length} active
                  </span>
                </li>
                <li className="flex items-center justify-between py-2">
                  <Link to="/upstreams" className="hover:text-primary">
                    Upstreams
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {activeUpstreams.length}/{upstreams.length} active
                  </span>
                </li>
                <li className="flex items-center justify-between py-2">
                  <Link to="/policies" className="hover:text-primary">
                    Policies
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    {activePolicies.length}/{policies.length} active
                  </span>
                </li>
              </ul>
            </Panel>

            <div className="lg:col-span-2">
              <Panel
                title="Recent activity"
                action={
                  <Link
                    to="/audit"
                    className="flex items-center gap-1 font-mono text-xs tracking-widest text-muted-foreground uppercase hover:text-foreground"
                  >
                    View all
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                }
              >
                {recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calls recorded yet.</p>
                ) : (
                  <div className="-m-4 border-t border-border">
                    {recent.map((event) => {
                      const style = DECISION_STYLES[event.decision]
                      return (
                        <div
                          key={event.id}
                          className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 last:border-b-0"
                        >
                          <span className={cn("truncate font-mono text-sm", style.line)}>
                            <span className="text-muted-foreground">$ </span>
                            {event.upstream ?? "?"}.{event.target}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 font-mono text-xs">
                            <span className="hidden text-muted-foreground sm:inline">{event.agent ?? "?"}</span>
                            <span className={cn("uppercase", style.text)}>
                              {event.decision} {style.symbol}
                            </span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
