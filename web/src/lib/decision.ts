import type { AuditEvent } from "@/lib/types"

export const DECISION_STYLES: Record<
  AuditEvent["decision"],
  { badge: string; text: string; symbol: string; line: string }
> = {
  allow: {
    badge: "border-status-emerald text-status-emerald",
    text: "text-status-emerald",
    symbol: "✓",
    line: "text-foreground",
  },
  deny: {
    badge: "border-status-red text-status-red",
    text: "text-status-red",
    symbol: "✗",
    line: "text-status-red/70 line-through decoration-status-red/70",
  },
  error: {
    badge: "border-status-amber text-status-amber",
    text: "text-status-amber",
    symbol: "!",
    line: "text-status-amber/80",
  },
}
