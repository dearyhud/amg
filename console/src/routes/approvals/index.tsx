import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { useApprovals } from "@/api/queries/approvals";
import type { Approval, ApprovalState } from "@/api/schemas";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountdownChip } from "@/components/countdown-chip";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/format";

export function ApprovalStateBadge({ state }: { state: ApprovalState }) {
  const variant =
    state === "pending"
      ? ("warning" as const)
      : state === "approved"
        ? ("success" as const)
        : state === "denied"
          ? ("destructive" as const)
          : ("muted" as const);
  return <Badge variant={variant}>{state}</Badge>;
}

function ApprovalCard({ approval }: { approval: Approval }) {
  return (
    <Link
      to="/approvals/$approvalId"
      params={{ approvalId: approval.id }}
      className="block rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm">{approval.payload.tool}</span>
        {approval.state === "pending" ? (
          <CountdownChip expiresAt={approval.expires_at} />
        ) : (
          <ApprovalStateBadge state={approval.state} />
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{approval.payload.agent_name}</span>
        <span>·</span>
        <span className="font-mono">{approval.payload.role_name}</span>
        <span>·</span>
        <span>requested {formatRelative(approval.created_at)}</span>
        {approval.approver && (
          <>
            <span>·</span>
            <span>
              {approval.state} by {approval.approver}
            </span>
          </>
        )}
      </div>
    </Link>
  );
}

export function ApprovalsPage() {
  const approvals = useApprovals();

  if (approvals.isPending) return <Skeleton className="h-96 w-full" />;

  const pending = approvals.data?.filter((a) => a.state === "pending") ?? [];
  const resolved = approvals.data?.filter((a) => a.state !== "pending") ?? [];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Destructive calls parked by policy, waiting on a human. Payloads are immutable."
      />

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <BellRing className="h-4 w-4 text-warning" />
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Queue is empty. Destructive tool calls land here before they touch an upstream.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Resolved ({resolved.length})
        </h2>
        <div className="space-y-2">
          {resolved.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} />
          ))}
        </div>
      </section>
    </>
  );
}
