import { useEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"
import { DECISION_STYLES } from "@/lib/decision"
import type { Agent, AuditEvent, Upstream } from "@/lib/types"

interface Filters {
  decision: string
  agentId: string
  upstreamId: string
  from: string
  to: string
}

const EMPTY_FILTERS: Filters = { decision: "", agentId: "", upstreamId: "", from: "", to: "" }

// Keeps `active` true for at least `minMs` once it turns true, so a fast
// refetch doesn't flash the spinner for a single frame.
function useMinDuration(active: boolean, minMs: number): boolean {
  const [shown, setShown] = useState(active)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (active) {
      shownAtRef.current = Date.now()
      setShown(true)
      return
    }

    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : minMs
    const remaining = Math.max(minMs - elapsed, 0)
    const timer = setTimeout(() => setShown(false), remaining)
    return () => clearTimeout(timer)
  }, [active, minMs])

  return shown
}

export function AuditPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api<{ agents: Agent[] }>("/agents"),
  })
  const { data: upstreamsData } = useQuery({
    queryKey: ["upstreams"],
    queryFn: () => api<{ upstreams: Upstream[] }>("/upstreams"),
  })

  const params = new URLSearchParams()
  if (filters.decision) params.set("decision", filters.decision)
  if (filters.agentId) params.set("agent_id", filters.agentId)
  if (filters.upstreamId) params.set("upstream_id", filters.upstreamId)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  const query = params.toString()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit", filters],
    queryFn: () => api<{ events: AuditEvent[] }>(`/audit${query ? `?${query}` : ""}`),
    placeholderData: keepPreviousData,
  })

  const showSpinner = useMinDuration(isFetching && !isLoading, 500)
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-medium">Audit</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Decision</Label>
          <Select
            value={filters.decision || "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, decision: v === "all" ? "" : v }))}
          >
            <SelectTrigger className="w-36">
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

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Agent</Label>
          <Select
            value={filters.agentId || "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, agentId: v === "all" ? "" : v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agentsData?.agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Upstream</Label>
          <Select
            value={filters.upstreamId || "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, upstreamId: v === "all" ? "" : v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All upstreams</SelectItem>
              {upstreamsData?.upstreams.map((upstream) => (
                <SelectItem key={upstream.id} value={upstream.id}>
                  {upstream.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="w-36"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="w-36"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : !data || data.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <div className="relative">
          {showSpinner && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <div
            className={cn(
              "overflow-hidden rounded-lg border border-border bg-black transition-opacity",
              showSpinner && "opacity-40",
            )}
          >
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
                      {event.deny_reason && (
                        <div className="mt-1 text-status-red/80">reason: {event.deny_reason}</div>
                      )}
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
        </div>
      )}
    </div>
  )
}
