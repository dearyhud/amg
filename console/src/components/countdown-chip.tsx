import { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatCountdown } from "@/lib/format";

const URGENT_MS = 2 * 60 * 1000;

export function CountdownChip({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => parseISO(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(
      () => setRemaining(parseISO(expiresAt).getTime() - Date.now()),
      1000,
    );
    return () => clearInterval(interval);
  }, [expiresAt]);

  const variant = remaining <= 0 ? "destructive" : remaining < URGENT_MS ? "warning" : "outline";
  return (
    <Badge variant={variant} className="font-mono tabular-nums">
      {remaining <= 0 ? "expired" : formatCountdown(remaining)}
    </Badge>
  );
}
