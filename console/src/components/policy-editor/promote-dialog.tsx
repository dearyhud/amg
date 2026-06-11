import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { usePromoteRole, useShadowStats } from "@/api/queries/roles";
import type { RoleDetail } from "@/api/schemas";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/charts/sparkline";

/*
 * The enforcement toggle is a ceremony, not a switch. Promotion shows the
 * trailing-7-day shadow-deny evidence; a non-zero count requires typing
 * the role name — same energy as a prod migration cut-over.
 */
export function PromoteDialog({ role }: { role: RoleDetail }) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const stats = useShadowStats(role.id, open);
  const promote = usePromoteRole(role.id);

  const denyCount = stats.data?.total_shadow_denies ?? 0;
  const needsConfirmation = denyCount > 0;
  const confirmed = !needsConfirmation || confirmName === role.name;

  const onPromote = () => {
    promote.mutate(
      { confirm_name: confirmName || undefined },
      {
        onSuccess: () => {
          toast.success(`${role.name} is now enforcing`);
          setOpen(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "promotion failed"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setConfirmName("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldAlert className="text-warning" />
          Shadow ▸ Enforce
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Promote <span className="font-mono">{role.name}</span> to enforce
          </DialogTitle>
          <DialogDescription>
            Every decision this policy currently logs as <span className="text-warning">shadow
            deny</span> will become a real denial returned to the agent.
          </DialogDescription>
        </DialogHeader>

        {stats.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : stats.data ? (
          <div className="rounded-md border bg-background/50 p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {denyCount}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    shadow denies, trailing 7 days
                  </span>
                </p>
                {denyCount === 0 && (
                  <p className="mt-1 text-xs text-success">
                    Zero discrepancies — clean cut-over signal.
                  </p>
                )}
              </div>
              <Sparkline points={stats.data.days.map((d) => d.shadow_denies)} />
            </div>
          </div>
        ) : null}

        {needsConfirmation && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-role-name">
              This role is still denying in shadow. Type{" "}
              <span className="font-mono text-foreground">{role.name}</span> to promote anyway.
            </Label>
            <Input
              id="confirm-role-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={role.name}
              className="font-mono"
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onPromote} disabled={!confirmed || promote.isPending || stats.isPending}>
            {promote.isPending ? "Promoting…" : "Promote to enforce"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
