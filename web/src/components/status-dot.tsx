import { cn } from "@/lib/utils"

type Status = "healthy" | "allow" | "errored" | "deny" | "degraded"

const COLORS: Record<Status, string> = {
  healthy: "bg-status-emerald",
  allow: "bg-status-emerald",
  errored: "bg-status-red",
  deny: "bg-status-red",
  degraded: "bg-status-amber",
}

export function StatusDot({ status, label, className }: { status: Status; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", COLORS[status])} aria-hidden />
      {label}
    </span>
  )
}
