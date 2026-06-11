import { Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useMe } from "@/api/queries/me";
import { useApprovalStream } from "@/api/queries/approvals";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
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

function SignIn() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">AMG Console</h1>
          <p className="text-sm text-muted-foreground">Agentic MCP Gateway · control plane</p>
        </div>
      </div>
      <Button asChild size="lg">
        {/* OAuth happens entirely server-side */}
        <a href="/admin/api/auth/google">Continue with Google</a>
      </Button>
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Access is limited to the server-side admin allow-list. Sessions are first-party,
        httpOnly cookies.
      </p>
    </div>
  );
}
