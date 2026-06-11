import { z } from "zod";

/*
 * Every API response passes through one of these at the client boundary.
 * Field names are snake_case — they mirror the Ruby serializers exactly,
 * and contract tests on both sides catch drift.
 */

export const decisionSchema = z.enum(["allow", "deny", "shadow_deny", "needs_approval"]);
export type Decision = z.infer<typeof decisionSchema>;

export const enforcementSchema = z.enum(["enforce", "shadow"]);
export type Enforcement = z.infer<typeof enforcementSchema>;

// -- session ----------------------------------------------------------------

export const meSchema = z.object({
  user: z.object({ email: z.string(), name: z.string() }),
  csrf_token: z.string(),
});
export type Me = z.infer<typeof meSchema>;

// -- roles & policies --------------------------------------------------------

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  enforcement: enforcementSchema,
  policy_version: z.number(),
  updated_at: z.string(),
  agent_count: z.number(),
});
export type Role = z.infer<typeof roleSchema>;

export const policyVersionSchema = z.object({
  version: z.number(),
  yaml: z.string(),
  author: z.string().nullable(),
  created_at: z.string(),
});
export type PolicyVersion = z.infer<typeof policyVersionSchema>;

export const roleDetailSchema = roleSchema.extend({
  policy_yaml: z.string(),
  versions: z.array(policyVersionSchema),
});
export type RoleDetail = z.infer<typeof roleDetailSchema>;

const rateSchema = z.object({ limit: z.number(), period: z.number() });

export const compiledToolSchema = z.object({
  name: z.string(),
  constraints: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  allow_args: z.array(z.string()).optional(),
  redact: z.array(z.string()).optional(),
});
export type CompiledTool = z.infer<typeof compiledToolSchema>;

export const compiledPolicySchema = z.object({
  role: z.string(),
  enforcement: enforcementSchema,
  servers: z.record(z.string(), z.object({ tools: z.array(compiledToolSchema) })),
  limits: z.object({ rate: rateSchema.optional(), per_agent: rateSchema.optional() }),
  approvals: z.array(
    z.object({ match: z.string(), require: z.literal("human"), timeout: z.number() }),
  ),
});
export type CompiledPolicy = z.infer<typeof compiledPolicySchema>;

export const compileErrorSchema = z.object({
  message: z.string(),
  line: z.number().nullable(),
  column: z.number().nullable(),
});
export type CompileError = z.infer<typeof compileErrorSchema>;

export const compileResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), compiled: compiledPolicySchema }),
  z.object({ ok: z.literal(false), errors: z.array(compileErrorSchema) }),
]);
export type CompileResult = z.infer<typeof compileResultSchema>;

export const shadowStatsSchema = z.object({
  days: z.array(
    z.object({ date: z.string(), shadow_denies: z.number(), total: z.number() }),
  ),
  total_shadow_denies: z.number(),
});
export type ShadowStats = z.infer<typeof shadowStatsSchema>;

// -- agents & tokens ----------------------------------------------------------

export const agentStatusSchema = z.enum(["active", "suspended"]);

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: agentStatusSchema,
  role: z.string(),
  created_at: z.string(),
  last_seen_at: z.string().nullable(),
  token_count: z.number(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentTokenSchema = z.object({
  id: z.string(),
  digest_prefix: z.string(),
  created_at: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});
export type AgentToken = z.infer<typeof agentTokenSchema>;

export const agentDetailSchema = agentSchema.extend({
  tokens: z.array(agentTokenSchema),
  activity: z.array(
    z.object({
      date: z.string(),
      allow: z.number(),
      deny: z.number(),
      shadow_deny: z.number(),
      needs_approval: z.number(),
    }),
  ),
});
export type AgentDetail = z.infer<typeof agentDetailSchema>;

export const issuedTokenSchema = z.object({
  token_id: z.string(),
  token: z.string(),
});
export type IssuedToken = z.infer<typeof issuedTokenSchema>;

// -- upstreams -----------------------------------------------------------------

export const upstreamSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["mcp", "http"]),
  endpoint: z.string(),
  status: z.enum(["ok", "error", "unknown"]),
  last_tools_list_at: z.string().nullable(),
  tool_count: z.number(),
});
export type Upstream = z.infer<typeof upstreamSchema>;

export const upstreamDetailSchema = upstreamSchema.extend({
  tools: z.array(z.object({ name: z.string(), description: z.string().nullable() })),
});
export type UpstreamDetail = z.infer<typeof upstreamDetailSchema>;

// -- audit ----------------------------------------------------------------------

export const auditEventSchema = z.object({
  id: z.number(),
  agent_id: z.string(),
  agent_name: z.string(),
  role_name: z.string(),
  policy_version: z.number(),
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  decision: decisionSchema,
  deny_reason: z.string().nullable(),
  upstream_status: z.string().nullable(),
  latency_ms: z.number().nullable(),
  request_id: z.string(),
  created_at: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditPageSchema = z.object({
  events: z.array(auditEventSchema),
  next_cursor: z.string().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

export const replayResultSchema = z.object({
  verdict: decisionSchema,
  reason: z.string().nullable(),
  policy_version: z.number(),
});
export type ReplayResult = z.infer<typeof replayResultSchema>;

// -- approvals ---------------------------------------------------------------------

export const approvalStateSchema = z.enum(["pending", "approved", "denied", "expired"]);
export type ApprovalState = z.infer<typeof approvalStateSchema>;

export const approvalSchema = z.object({
  id: z.string(),
  state: approvalStateSchema,
  created_at: z.string(),
  expires_at: z.string(),
  resolved_at: z.string().nullable(),
  approver: z.string().nullable(),
  reason: z.string().nullable(),
  payload: z.object({
    agent_id: z.string(),
    agent_name: z.string(),
    role_name: z.string(),
    tool: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    request_id: z.string(),
  }),
});
export type Approval = z.infer<typeof approvalSchema>;

export const approvalListSchema = z.object({ approvals: z.array(approvalSchema) });

// -- dashboard ------------------------------------------------------------------------

export const dashboardSchema = z.object({
  decisions_by_day: z.array(
    z.object({
      date: z.string(),
      allow: z.number(),
      deny: z.number(),
      shadow_deny: z.number(),
      needs_approval: z.number(),
    }),
  ),
  shadow_rates: z.array(
    z.object({
      role: z.string(),
      points: z.array(
        z.object({ date: z.string(), denies: z.number(), total: z.number() }),
      ),
    }),
  ),
  top_denied_tools: z.array(z.object({ tool: z.string(), count: z.number() })),
  top_deny_reasons: z.array(z.object({ reason: z.string(), count: z.number() })),
  approvals: z.object({
    pending: z.number(),
    median_resolution_minutes: z.number().nullable(),
  }),
  upstream_health: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["mcp", "http"]),
      status: z.enum(["ok", "error", "unknown"]),
      last_tools_list_at: z.string().nullable(),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

// -- settings ----------------------------------------------------------------------------

export const settingsSchema = z.object({
  allowed_admins: z.array(z.string()),
  slack_webhook_url: z.string().nullable(),
  redaction_defaults: z.array(z.string()),
});
export type Settings = z.infer<typeof settingsSchema>;

export const okSchema = z.object({ ok: z.literal(true) });
