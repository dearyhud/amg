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
          <span className="font-mono text-sm font-semibold tracking-widest uppercase">amg</span>
        </div>
        <nav className="flex flex-1 flex-col gap-px p-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 font-mono text-xs tracking-widest uppercase transition-colors",
                  active
                    ? "border-foreground bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 truncate font-mono text-xs text-muted-foreground">
            {admin?.email} &middot; {admin?.role}
          </div>
          <button
            onClick={() => void logout()}
            className="flex items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground uppercase hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
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
