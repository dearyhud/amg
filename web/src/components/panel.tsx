import type { ReactNode } from "react"

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </div>
  )
}
