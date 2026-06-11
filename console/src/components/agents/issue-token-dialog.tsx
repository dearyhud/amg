import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/api/client";
import { issuedTokenSchema } from "@/api/schemas";
import { agentKeys } from "@/api/keys";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton } from "@/components/copy-button";

/*
 * The plaintext token lives exclusively in this component's state — never
 * in the Query cache, router state, or storage (which is why this calls
 * the api client directly instead of useMutation). Closing the dialog is
 * final: state resets, and the server cannot re-reveal a digest.
 */
export function IssueTokenDialog({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [open, setOpen] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>("never");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ token: string; tokenId: string } | null>(null);
  const queryClient = useQueryClient();

  const issue = async () => {
    setIssuing(true);
    try {
      const result = await api.post(issuedTokenSchema, `/agents/${agentId}/tokens`, {
        expires_in: expiresIn === "never" ? undefined : expiresIn,
      });
      setIssued({ token: result.token, tokenId: result.token_id });
      void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "token issuance failed");
    } finally {
      setIssuing(false);
    }
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // closing is final — the plaintext is gone from this UI forever
      setIssued(null);
      setExpiresIn("never");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button>
          <KeyRound />
          Issue token
        </Button>
      </DialogTrigger>
      <DialogContent hideClose={issued !== null}>
        {issued === null ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Issue token for <span className="font-mono">{agentName}</span>
              </DialogTitle>
              <DialogDescription>
                The agent runtime presents this as its bearer token. AMG stores only a digest.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Expiry</Label>
              <Select value={expiresIn} onValueChange={setExpiresIn}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={issue} disabled={issuing}>
                {issuing ? "Issuing…" : "Issue token"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Token issued</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 text-warning">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                This will never be shown again. Store it now.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code
                data-testid="issued-token"
                className="block flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-background/60 p-2.5 font-mono text-xs"
              >
                {issued.token}
              </code>
              <CopyButton value={issued.token} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                I&apos;ve stored it — close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
