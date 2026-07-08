import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Constraint, PolicyRule, Tool, Upstream } from "@/lib/types"

const OPS = ["eq", "neq", "in", "not_in", "matches", "lt", "lte", "gt", "gte", "prefix", "exists", "absent"]

export function emptyRule(upstreamId: string): PolicyRule {
  return { upstream_id: upstreamId, target: "", constraints: [], strict_args: false }
}

function schemaProperties(tool: Tool | undefined): string[] {
  const props = tool?.input_schema?.properties
  return props && typeof props === "object" ? Object.keys(props) : []
}

export function PolicyRuleEditor({
  rules,
  upstreams,
  onChange,
  toolsByUpstream = {},
  onUpstreamUsed,
  readOnly = false,
}: {
  rules: PolicyRule[]
  upstreams: Upstream[]
  onChange: (rules: PolicyRule[]) => void
  toolsByUpstream?: Record<string, Tool[]>
  onUpstreamUsed?: (upstreamId: string) => void
  readOnly?: boolean
}) {
  const firstUpstreamId = upstreams[0]?.id ?? ""

  function addRule() {
    onChange([...rules, emptyRule(firstUpstreamId)])
    if (firstUpstreamId) onUpstreamUsed?.(firstUpstreamId)
  }

  function updateRule(index: number, patch: Partial<PolicyRule>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  }

  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index))
  }

  function addConstraint(index: number) {
    updateRule(index, { constraints: [...rules[index].constraints, { path: "", op: "eq", value: "" }] })
  }

  function updateConstraint(ruleIndex: number, cIndex: number, patch: Partial<Constraint>) {
    const constraints = rules[ruleIndex].constraints.map((c, i) => (i === cIndex ? { ...c, ...patch } : c))
    updateRule(ruleIndex, { constraints })
  }

  function removeConstraint(ruleIndex: number, cIndex: number) {
    updateRule(ruleIndex, { constraints: rules[ruleIndex].constraints.filter((_, i) => i !== cIndex) })
  }

  return (
    <div className="space-y-3">
      {rules.map((rule, ruleIndex) => {
        const tools = toolsByUpstream[rule.upstream_id] ?? []
        const upstream = upstreams.find((u) => u.id === rule.upstream_id)
        const isMcp = upstream?.kind === "mcp_stdio" || upstream?.kind === "mcp_http"
        const selectedTool = tools.find((t) => t.name === rule.target)
        const targetListId = `targets-${ruleIndex}`
        const pathListId = `paths-${ruleIndex}`

        return (
          <div key={ruleIndex} className="space-y-3 border border-border p-3">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
              <Select
                value={rule.upstream_id}
                disabled={readOnly}
                onValueChange={(v) => {
                  updateRule(ruleIndex, { upstream_id: v })
                  onUpstreamUsed?.(v)
                }}
              >
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Upstream" />
                </SelectTrigger>
                <SelectContent>
                  {upstreams.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Input
                  placeholder={isMcp ? "tool name, or * for all" : "METHOD /path, or * for all"}
                  value={rule.target}
                  onChange={(e) => updateRule(ruleIndex, { target: e.target.value })}
                  className="rounded-none font-mono text-sm"
                  list={isMcp && tools.length > 0 ? targetListId : undefined}
                  disabled={readOnly}
                />
                {isMcp && tools.length > 0 && (
                  <datalist id={targetListId}>
                    {tools.map((t) => (
                      <option key={t.name} value={t.name} />
                    ))}
                  </datalist>
                )}
              </div>
              {!readOnly && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="rounded-none"
                  onClick={() => removeRule(ruleIndex)}
                  aria-label="Remove rule"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>

            {rule.constraints.map((c, cIndex) => {
              const props = schemaProperties(selectedTool)
              return (
                <div key={cIndex} className="flex items-center gap-2">
                  <div>
                    <Input
                      placeholder="/path"
                      value={c.path}
                      onChange={(e) => updateConstraint(ruleIndex, cIndex, { path: e.target.value })}
                      className="rounded-none font-mono text-sm"
                      list={props.length > 0 ? pathListId : undefined}
                      disabled={readOnly}
                    />
                    {props.length > 0 && (
                      <datalist id={pathListId}>
                        {props.map((p) => (
                          <option key={p} value={`/${p}`} />
                        ))}
                      </datalist>
                    )}
                  </div>
                  <Select value={c.op} disabled={readOnly} onValueChange={(v) => updateConstraint(ruleIndex, cIndex, { op: v })}>
                    <SelectTrigger className="w-28 rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="value"
                    value={String(c.value ?? "")}
                    onChange={(e) => updateConstraint(ruleIndex, cIndex, { value: e.target.value })}
                    className="rounded-none font-mono text-sm"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="rounded-none"
                      onClick={() => removeConstraint(ruleIndex, cIndex)}
                      aria-label="Remove constraint"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              )
            })}
            {!readOnly && (
              <Button
                size="sm"
                variant="ghost"
                className="rounded-none font-mono text-xs tracking-widest uppercase"
                onClick={() => addConstraint(ruleIndex)}
              >
                + constraint
              </Button>
            )}
          </div>
        )
      })}
      {!readOnly && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-none font-mono text-xs tracking-widest uppercase"
          onClick={addRule}
        >
          + rule
        </Button>
      )}
    </div>
  )
}
