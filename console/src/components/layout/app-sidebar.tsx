import { Link } from "@tanstack/react-router";
import {
  BellRing,
  Bot,
  Gauge,
  Moon,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { usePendingApprovalCount } from "@/api/queries/approvals";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/roles", label: "Roles", icon: ShieldCheck },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/upstreams", label: "Upstreams", icon: Server },
  { to: "/audit", label: "Audit", icon: ScrollText },
  { to: "/approvals", label: "Approvals", icon: BellRing },
  { to: "/settings", label: "Settings", icon: Settings },
] satisfies { to: string; label: string; icon: ComponentType<{ className?: string }> }[];

export function AppSidebar({ user }: { user: { email: string; name: string } }) {
  const pendingCount = usePendingApprovalCount();

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2 px-4 py-4">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-mono text-sm font-semibold tracking-tight">amg</span>
        <span className="text-xs text-muted-foreground">console</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            activeProps={{ className: "bg-secondary/80 !text-foreground font-medium" }}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {to === "/approvals" && pendingCount > 0 && (
              <Badge variant="warning" className="px-1.5 py-0 font-mono tabular-nums">
                {pendingCount}
              </Badge>
            )}
          </Link>
        ))}
      </nav>

      <div className="p-3">
        <Separator className="mb-3" />
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <ThemeToggle />
        </div>
        <a
          href="/admin/api/auth/logout"
          className="mt-2 block px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </a>
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const [light, setLight] = useState(() => document.documentElement.classList.contains("light"));

  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    document.documentElement.classList.toggle("dark", !light);
  }, [light]);

  return (
    <button
      type="button"
      onClick={() => setLight((v) => !v)}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
      aria-label="Toggle theme"
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
