import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/status-dot"
import { api } from "@/lib/api"
import type { AuditEvent } from "@/lib/types"

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
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Surface</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.events.map((event) => (
              <Fragment key={event.id}>
                <TableRow
                  key={event.id}
                  className="cursor-pointer"
                  onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(event.occurred_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.surface}</TableCell>
                  <TableCell className="font-mono text-xs">{event.target}</TableCell>
                  <TableCell>
                    <StatusDot
                      status={event.decision === "allow" ? "allow" : event.decision === "error" ? "degraded" : "deny"}
                      label={event.deny_reason ?? event.decision}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {event.latency_ms != null ? `${event.latency_ms}ms` : "—"}
                  </TableCell>
                </TableRow>
                {expanded === event.id && (
                  <TableRow key={`${event.id}-detail`}>
                    <TableCell colSpan={5} className="bg-muted/50 font-mono text-xs">
                      <div>request_id: {event.request_id}</div>
                      <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(event.args_redacted, null, 2)}</pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
