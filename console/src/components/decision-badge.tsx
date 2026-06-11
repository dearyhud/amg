import { Badge } from "@/components/ui/badge";
import type { Decision } from "@/api/schemas";

/*
 * The one place color carries semantics. Shadow denials are visually loud
 * on purpose — they are the data you're farming.
 */
const VARIANTS: Record<Decision, { variant: "muted" | "destructive" | "warning" | "info"; label: string }> = {
  allow: { variant: "muted", label: "allow" },
  deny: { variant: "destructive", label: "deny" },
  shadow_deny: { variant: "warning", label: "shadow deny" },
  needs_approval: { variant: "info", label: "needs approval" },
};

export function DecisionBadge({ decision }: { decision: Decision }) {
  const { variant, label } = VARIANTS[decision];
  return (
    <Badge variant={variant} data-decision={decision} className="font-mono">
      {label}
    </Badge>
  );
}
