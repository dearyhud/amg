import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Check, X } from "lucide-react";
import { useApproval, useResolveApproval } from "@/api/queries/approvals";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CountdownChip } from "@/components/countdown-chip";
import { JsonView } from "@/components/json-view";
import { PageHeader } from "@/components/page-header";
import { ApprovalStateBadge } from "@/routes/approvals";
import { formatDateTime } from "@/lib/format";

export function ApprovalDetailPage() {
  const { approvalId } = useParams({ from: "/approvals/$approvalId" });
  const approval = useApproval(approvalId);
  const resolve = useResolveApproval(approvalId);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<"approve" | "deny" | null>(null);
  const [reason, setReason] = useState("");

  if (approval.isPending) return <Skeleton className="h-96 w-full" />;
  if (approval.isError) return <p className="text-sm text-destructive">Approval not found.</p>;

  const data = approval.data;
  const pending = data.state === "pending";

  const submit = () => {
    if (!confirming) return;
    resolve.mutate(
      { action: confirming, reason },
      {
        onSuccess: (resolved) => {
          toast.success(
            confirming === "approve"
              ? "Approved — the parked call has been forwarded upstream"
              : "Denied — the agent will see the denial on its next check",
          );
          setConfirming(null);
          void navigate({ to: "/approvals/$approvalId", params: { approvalId: resolved.id } });
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "resolution failed"),
      },
    );
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/approvals">
          <ArrowLeft />
          Approvals
        </Link>
      </Button>

      <PageHeader
        title={data.payload.tool}
        mono
        actions={
          pending ? (
            <>
              <CountdownChip expiresAt={data.expires_at} />
              <Button variant="outline" onClick={() => setConfirming("deny")}>
                <X className="text-destructive" />
                Deny
              </Button>
              <Button onClick={() => setConfirming("approve")}>
                <Check />
                Approve
              </Button>
            </>
          ) : (
            <ApprovalStateBadge state={data.state} />
          )
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="agent" value={data.payload.agent_name} mono />
            <Row label="role" value={data.payload.role_name} mono />
            <Row label="requested" value={formatDateTime(data.created_at)} mono />
            <Row label="expires" value={formatDateTime(data.expires_at)} mono />
            <Row label="request id" value={data.payload.request_id} mono />
            {data.approver && <Row label="resolved by" value={data.approver} />}
            {data.reason && <Row label="reason" value={data.reason} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parked payload</CardTitle>
            <p className="text-xs text-muted-foreground">
              Exactly what the agent sent. Approval forwards this verbatim — arguments cannot be
              edited here or anywhere.
            </p>
          </CardHeader>
          <CardContent>
            <JsonView
              value={{ tool: data.payload.tool, arguments: data.payload.arguments }}
              className="max-h-80"
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming === "approve" ? "Approve" : "Deny"}{" "}
              <span className="font-mono">{data.payload.tool}</span>
            </DialogTitle>
            <DialogDescription>
              {confirming === "approve"
                ? "The parked call is forwarded upstream exactly as the agent sent it."
                : "The agent will receive a denial; nothing is forwarded."}{" "}
              The reason lands in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resolution-reason">Reason (required)</Label>
            <Textarea
              id="resolution-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                confirming === "approve" ? "confirmed with the docs team" : "page is still in use"
              }
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant={confirming === "deny" ? "destructive" : "default"}
              onClick={submit}
              disabled={!reason.trim() || resolve.isPending}
            >
              {resolve.isPending
                ? "Resolving…"
                : confirming === "approve"
                  ? "Approve and forward"
                  : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-xs"}>{value}</span>
    </div>
  );
}
