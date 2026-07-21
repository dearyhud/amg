export interface Admin {
  id: string
  email: string
  role: "owner" | "admin" | "auditor"
}

export interface Agent {
  id: string
  workspace_id: string
  slug: string
  display_name: string
  status: "active" | "disabled"
  created_at: string
}

export interface AgentKey {
  id: string
  prefix: string
  key?: string
}

export interface AgentKeySummary {
  id: string
  prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type UpstreamKind = "mcp_stdio" | "mcp_http" | "rest"

export interface Upstream {
  id: string
  workspace_id: string
  slug: string
  display_name: string
  kind: UpstreamKind
  config: Record<string, unknown>
  status: "active" | "disabled"
  oauth_connected?: boolean
  created_at: string
}

export interface Tool {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
  output_schema?: Record<string, unknown>
}

export interface Constraint {
  path: string
  op: string
  value?: unknown
}

export interface PolicyRule {
  id?: string
  upstream_id: string
  target: string
  constraints: Constraint[]
  strict_args: boolean
}

export interface BoundAgentSummary {
  id: string
  slug: string
  display_name: string
}

export interface Policy {
  id: string
  workspace_id: string
  name: string
  status: "active" | "disabled"
  rules?: PolicyRule[]
  rule_count?: number
  bound_agents: number
  bound_agent_list?: BoundAgentSummary[]
  created_at: string
  updated_at: string
}

export interface EffectivePermissions {
  agent_id: string
  rules: (PolicyRule & { created_at: string; policy_id: string; policy_name: string })[]
}

export interface AuditEvent {
  id: string
  workspace_id: string
  occurred_at: string
  agent_id: string | null
  agent: string | null
  role: string | null
  api_key_id: string | null
  upstream_id: string | null
  upstream: string | null
  surface: "mcp" | "rest" | "admin"
  target: string
  decision: "allow" | "deny" | "error"
  deny_reason: string | null
  matched_rule: string | null
  args_redacted: Record<string, unknown> | null
  upstream_status: number | null
  latency_ms: number | null
  request_id: string
}

export interface SimulateResult {
  allowed: boolean
  reason: string | null
  matched_rule: string | null
}
