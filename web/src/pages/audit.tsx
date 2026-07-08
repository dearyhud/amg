import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import type { AuditEvent } from "@/lib/types"

const DECISION_STYLES: Record<AuditEvent["decision"], { badge: string; symbol: string; line: string }> = {
  allow: { badge: "border-status-emerald text-status-emerald", symbol: "✓", line: "text-foreground" },
  deny: {
    badge: "border-status-red text-status-red",
    symbol: "✗",
    line: "text-status-red/70 line-through decoration-status-red/70",
  },
  error: { badge: "border-status-amber text-status-amber", symbol: "!", line: "text-status-amber/80" },
}

export function AuditPage() {
  const [decision, setDecision] = useState<string>("")
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["audit", decision],
    queryFn: () => api<{ events: AuditEvent[] }>(`/audit${decision ? `?decision=${decision}` : ""}`),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Audit</h1>
        <Select value={decision || "all"} onValueChange={(v) => setDecision(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All decisions</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="deny">Deny</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : !data || data.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-black">
          {data.events.map((event) => {
            const style = DECISION_STYLES[event.decision]
            const isExpanded = expanded === event.id
            return (
              <div key={event.id} className="border-b border-white/5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : event.id)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-white/[0.03]"
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate font-mono text-sm", style.line)}>
                      <span className="text-muted-foreground">$ </span>
                      {event.upstream ?? "unknown upstream"}.{event.target}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                      {event.agent ?? "unknown agent"}
                      {event.role ? ` · ${event.role}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                      {new Date(event.occurred_at).toLocaleString()}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-xs uppercase tracking-wide",
                        style.badge,
                      )}
                    >
                      {event.decision} {style.symbol}
                    </span>
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-white/5 bg-white/[0.02] px-6 py-4 font-mono text-xs">
                    <div className="text-muted-foreground">request_id: {event.request_id}</div>
                    <div className="mt-1 text-muted-foreground">upstream: {event.upstream ?? "—"}</div>
                    <div className="mt-1 text-muted-foreground">agent: {event.agent ?? "—"}</div>
                    <div className="mt-1 text-muted-foreground">role: {event.role ?? "—"}</div>
                    {event.deny_reason && <div className="mt-1 text-status-red/80">reason: {event.deny_reason}</div>}
                    {event.matched_rule && (
                      <div className="mt-1 text-muted-foreground">matched_rule: {event.matched_rule}</div>
                    )}
                    <div className="mt-1 text-muted-foreground">
                      latency: {event.latency_ms != null ? `${event.latency_ms}ms` : "—"}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-foreground/90">
                      {JSON.stringify(event.args_redacted, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
