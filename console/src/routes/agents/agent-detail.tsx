import { lazy, Suspense } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Ban, Play } from "lucide-react";
import { useAgent, useRevokeToken, useSetAgentStatus } from "@/api/queries/agents";
import type { AgentToken } from "@/api/schemas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { IssueTokenDialog } from "@/components/agents/issue-token-dialog";
import { AgentStatusBadge } from "@/routes/agents";
import { formatDateTime, formatRelative } from "@/lib/format";

const ActivityChart = lazy(() => import("@/components/charts/activity-chart"));

function tokenState(token: AgentToken): { label: string; variant: "success" | "destructive" | "muted" } {
  if (token.revoked_at) return { label: "revoked", variant: "destructive" };
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now())
    return { label: "expired", variant: "muted" };
  return { label: "active", variant: "success" };
}

function RevokeTokenButton({ agentId, token }: { agentId: string; token: AgentToken }) {
  const revoke = useRevokeToken(agentId);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Revoke token <span className="font-mono">{token.digest_prefix}…</span>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Revocation takes effect within 30 seconds — the gateway&apos;s token cache TTL. Any
            in-flight session using this token will start receiving 401s. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              revoke.mutate(token.id, {
                onSuccess: () => toast.success("Token revoked"),
                onError: () => toast.error("revocation failed"),
              })
            }
          >
            Revoke token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AgentDetailPage() {
  const { agentId } = useParams({ from: "/agents/$agentId" });
  const agent = useAgent(agentId);
  const setStatus = useSetAgentStatus(agentId);

  if (agent.isPending) return <Skeleton className="h-96 w-full" />;
  if (agent.isError) return <p className="text-sm text-destructive">Agent not found.</p>;

  const data = agent.data;
  const suspended = data.status === "suspended";

  return (
    <>
      <PageHeader
        title={data.name}
        mono
        actions={
          <>
            <AgentStatusBadge status={data.status} />
            <Button
              variant="outline"
              onClick={() =>
                setStatus.mutate(suspended ? "active" : "suspended", {
                  onSuccess: () =>
                    toast.success(suspended ? "Agent reactivated" : "Agent suspended"),
                })
              }
              disabled={setStatus.isPending}
            >
              {suspended ? <Play /> : <Ban />}
              {suspended ? "Reactivate" : "Suspend"}
            </Button>
            <IssueTokenDialog agentId={data.id} agentName={data.name} />
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          role{" "}
          <Link to="/roles" className="font-mono text-primary hover:underline">
            {data.role}
          </Link>
        </span>
        <span>·</span>
        <span>registered {formatRelative(data.created_at)}</span>
        <span>·</span>
        <span>last seen {formatRelative(data.last_seen_at)}</span>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Decisions · last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <ActivityChart data={data.activity} />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tokens</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Digest</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tokens.map((token) => {
                  const state = tokenState(token);
                  return (
                    <TableRow key={token.id}>
                      <TableCell className="pl-4 font-mono text-muted-foreground">
                        {token.digest_prefix}…
                      </TableCell>
                      <TableCell>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(token.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {token.expires_at ? formatDateTime(token.expires_at) : "never"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelative(token.last_used_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {state.label === "active" && (
                          <RevokeTokenButton agentId={data.id} token={token} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
