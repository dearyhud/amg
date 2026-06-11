import { AlertTriangle, Check, CircleAlert, Loader2 } from "lucide-react";
import type { CompiledTool, CompileResult } from "@/api/schemas";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDuration } from "@/lib/format";

/*
 * Right pane of the policy editor: the compiled result, rendered the way
 * the gateway will actually enforce it.
 */
export function CompiledPreview({
  result,
  isCompiling,
}: {
  result: CompileResult | undefined;
  isCompiling: boolean;
}) {
  return (
    <div className="relative h-full min-h-80 overflow-auto rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Compiled
        </h3>
        {isCompiling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {!result && !isCompiling && (
        <p className="text-sm text-muted-foreground">Start typing to compile.</p>
      )}

      {result && !result.ok && (
        <ul className="space-y-1.5" data-testid="compile-errors">
          {result.errors.map((error, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {error.line != null && (
                  <span className="font-mono text-xs text-muted-foreground">L{error.line} </span>
                )}
                {error.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result?.ok && (
        <div className="space-y-3" data-testid="compile-ok">
          {Object.entries(result.compiled.servers).map(([server, cfg]) => (
            <section key={server}>
              <h4 className="mb-1 font-mono text-xs text-muted-foreground">{server}</h4>
              <ul className="space-y-1">
                {cfg.tools.map((tool) => (
                  <ToolRow key={tool.name} server={server} tool={tool} />
                ))}
              </ul>
            </section>
          ))}

          {result.compiled.approvals.length > 0 && (
            <>
              <Separator />
              <section>
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Approvals
                </h4>
                <ul className="space-y-1">
                  {result.compiled.approvals.map((rule, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="font-mono text-warning">{rule.match}</span>
                      <span className="text-muted-foreground">
                        → human, {formatDuration(rule.timeout)} timeout
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          {(result.compiled.limits.rate || result.compiled.limits.per_agent) && (
            <>
              <Separator />
              <section className="flex flex-wrap gap-2">
                {result.compiled.limits.rate && (
                  <Badge variant="outline" className="font-mono">
                    role · {result.compiled.limits.rate.limit}/
                    {formatDuration(result.compiled.limits.rate.period)}
                  </Badge>
                )}
                {result.compiled.limits.per_agent && (
                  <Badge variant="outline" className="font-mono">
                    per-agent · {result.compiled.limits.per_agent.limit}/
                    {formatDuration(result.compiled.limits.per_agent.period)}
                  </Badge>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ToolRow({ server, tool }: { server: string; tool: CompiledTool }) {
  const constraints = Object.entries(tool.constraints ?? {}).flatMap(([arg, ops]) =>
    Object.entries(ops).map(([op, expected]) => `${arg} ${op} ${JSON.stringify(expected)}`),
  );
  return (
    <li className="text-sm">
      <div className="flex items-center gap-2">
        <Check className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="font-mono">
          {server}__{tool.name}
        </span>
      </div>
      {(constraints.length > 0 || tool.allow_args || tool.redact) && (
        <div className="ml-5.5 space-y-0.5 pl-0.5 text-xs text-muted-foreground">
          {constraints.map((c) => (
            <p key={c} className="font-mono">
              {c}
            </p>
          ))}
          {tool.allow_args && <p className="font-mono">allow_args: {tool.allow_args.join(", ")}</p>}
          {tool.redact && <p className="font-mono">redact: {tool.redact.join(", ")}</p>}
        </div>
      )}
    </li>
  );
}
