import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  mono = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className={`text-lg font-semibold ${mono ? "font-mono" : ""}`}>{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
