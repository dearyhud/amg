import { cn } from "@/lib/utils";

/*
 * Read-only by construction: parked payloads and audit arguments are never
 * rendered into anything editable. Immutability is a backend invariant;
 * the UI reinforces it.
 */
export function JsonView({ value, className }: { value: unknown; className?: string }) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md border bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
