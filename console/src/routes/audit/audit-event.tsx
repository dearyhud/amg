import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useAuditEvent, useReplayAuditEvent } from "@/api/queries/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DecisionBadge } from "@/components/decision-badge";
import { JsonView } from "@/components/json-view";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";

export function AuditEventPage() {
  const { eventId } = useParams({ from: "/audit/$eventId" });
  const event = useAuditEvent(eventId);
  const replay = useReplayAuditEvent(eventId);

  if (event.isPending) return <Skeleton className="h-96 w-full" />;
  if (event.isError) return <p className="text-sm text-destructive">Event not found.</p>;

  const data = event.data;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/audit" search={{}}>
          <ArrowLeft />
          Audit
        </Link>
      </Button>

      <PageHeader
        title={data.tool}
        mono
        actions={
          <Button variant="outline" onClick={() => replay.mutate()} disabled={replay.isPending}>
            <RotateCcw />
            {replay.isPending ? "Replaying…" : "Replay decision"}
          </Button>
        }
      />

      {replay.data && (
        <Card className="mb-4 border-info/50">
          <CardContent className="flex items-center gap-3 p-3 text-sm">
            <span className="text-muted-foreground">Replay verdict:</span>
            <DecisionBadge decision={replay.data.verdict} />
            {replay.data.reason && (
              <span className="font-mono text-xs text-muted-foreground">{replay.data.reason}</span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              evaluated against policy v{replay.data.policy_version} · diagnostics only, never
              forwards upstream
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Field label="verdict">
              <DecisionBadge decision={data.decision} />
            </Field>
            {data.deny_reason && (
              <Field label="deny reason">
                <span className="font-mono text-xs text-destructive">{data.deny_reason}</span>
              </Field>
            )}
            <Field label="agent">
              <Link
                to="/agents/$agentId"
                params={{ agentId: data.agent_id }}
                className="font-mono text-xs text-primary hover:underline"
              >
                {data.agent_name}
              </Link>
            </Field>
            <Field label="role">
              <span className="font-mono text-xs">{data.role_name}</span>
              <Badge variant="outline" className="ml-2 font-mono">
                policy v{data.policy_version}
              </Badge>
            </Field>
            <Field label="upstream">
              <span className="font-mono text-xs">{data.upstream_status ?? "—"}</span>
              {data.latency_ms != null && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {data.latency_ms}ms
                </span>
              )}
            </Field>
            <Field label="time">
              <span className="font-mono text-xs">{formatDateTime(data.created_at)}</span>
            </Field>
            <Field label="request id">
              <span className="font-mono text-xs">{data.request_id}</span>
              <span className="ml-2">
                <CopyButton value={data.request_id} label="" />
              </span>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arguments (as audited, post-redaction)</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonView value={data.arguments} className="max-h-96" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center">{children}</span>
    </div>
  );
}
