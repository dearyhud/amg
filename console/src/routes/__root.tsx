import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useLogin, useMe } from "@/api/queries/me";
import { useApprovalStream } from "@/api/queries/approvals";
import { ApiError } from "@/api/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/layout/app-sidebar";

/*
 * Shell: sidebar, auth gate, toaster. The /me loader gates everything —
 * unauthenticated users go to the server-side Google flow. The SPA never
 * touches OAuth tokens.
 */
export function RootShell() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-8 w-44" />
      </div>
    );
  }

  if (me.isError) {
    return <SignIn />;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <StreamBridge />
      <div className="flex h-full">
        <AppSidebar user={me.data.user} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" toastOptions={{ className: "font-sans" }} />
    </TooltipProvider>
  );
}

// SSE subscription lives at the shell so the sidebar badge stays live on
// every route, not just /approvals.
function StreamBridge() {
  useApprovalStream();
  return null;
}

/*
 * v1 ships simple password auth: POST /auth/login sets the httpOnly
 * session cookie server-side. (Google SSO is the eventual target per the
 * TDD; this gate swaps out without touching the rest of the shell.)
 */
export function SignIn() {
  const [password, setPassword] = useState("");
  const login = useLogin();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">AMG Console</h1>
          <p className="text-sm text-muted-foreground">Agentic MCP Gateway · control plane</p>
        </div>
      </div>

      <form
        className="w-64 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) login.mutate(password);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="admin-password">Admin password</Label>
          <Input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {login.isError && (
          <p className="text-xs text-destructive" role="alert">
            {login.error instanceof ApiError ? login.error.message : "sign-in failed"}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={!password || login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Sessions are first-party, httpOnly cookies. The SPA holds zero credentials.
      </p>
    </div>
  );
}
