import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { LayoutDashboard, Bot, Server, ShieldCheck, ScrollText, LogOut } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/upstreams", label: "Upstreams", icon: Server },
  { to: "/policies", label: "Policies", icon: ShieldCheck },
  { to: "/audit", label: "Audit", icon: ScrollText },
]

export function RootLayout() {
  const { admin, logout } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex h-14 items-center border-b border-border px-4">
          <span className="font-mono text-sm font-semibold tracking-tight">amg</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 truncate text-xs text-muted-foreground">
            {admin?.email} &middot; {admin?.role}
          </div>
          <button
            onClick={() => void logout()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
