import type {
  Approval,
  AuditEvent,
  Decision,
  Enforcement,
  PolicyVersion,
} from "@/api/schemas";

/*
 * In-memory mock database, deterministically seeded so dev mode and tests
 * see the same world. One module instance per worker/test run.
 */

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  enforcement: Enforcement;
  policy_version: number;
  policy_yaml: string;
  versions: PolicyVersion[];
  updated_at: string;
}

export interface AgentRow {
  id: string;
  name: string;
  status: "active" | "suspended";
  role_name: string;
  created_at: string;
  last_seen_at: string | null;
}

export interface TokenRow {
  id: string;
  agent_id: string;
  digest_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface UpstreamRow {
  id: string;
  name: string;
  kind: "mcp" | "http";
  endpoint: string;
  status: "ok" | "error" | "unknown";
  last_tools_list_at: string | null;
  tools: { name: string; description: string | null }[];
}

export interface DbShape {
  roles: RoleRow[];
  agents: AgentRow[];
  tokens: TokenRow[];
  upstreams: UpstreamRow[];
  auditEvents: AuditEvent[]; // sorted newest-first
  approvals: Approval[];
  settings: {
    allowed_admins: string[];
    slack_webhook_url: string | null;
    redaction_defaults: string[];
  };
}

// mulberry32 — tiny seeded PRNG, deterministic across runs
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(0x5eed);
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
const hex = (n: number) =>
  Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");
const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;

const NOW = Date.now();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const minutesFromNow = (m: number) => new Date(NOW + m * 60_000).toISOString();

export const NOTION_READ_YAML = `role: notion_read
enforcement: shadow
servers:
  notion:
    tools:
      - name: get_pages
        constraints:
          workspace_id:
            in: ["ws_abc123"]
      - name: get_users
      - name: search
        redact: [query]
  stripe:
    tools:
      - name: get_payment_intents
        constraints:
          limit:
            lte: 100
limits:
  rate: 100/min
approvals:
  - match: "*delete*"
    require: human
    timeout: 15m
`;

const STRIPE_BILLING_YAML = `role: stripe_billing
enforcement: enforce
servers:
  stripe:
    tools:
      - name: get_payment_intents
        constraints:
          limit:
            lte: 50
      - name: get_payment_intent
      - name: get_customer
limits:
  rate: 60/min
  per_agent: 20/min
`;

const DOCS_WRITER_YAML = `role: docs_writer
enforcement: enforce
servers:
  notion:
    tools:
      - name: get_pages
      - name: create_page
      - name: update_page
      - name: delete_page
approvals:
  - match: "*delete*"
    require: human
    timeout: 15m
`;

function seedRoles(): RoleRow[] {
  const versionsFor = (yaml: string, count: number): PolicyVersion[] =>
    Array.from({ length: count }, (_, i) => ({
      version: i + 1,
      yaml:
        i === count - 1
          ? yaml
          : yaml.replace("rate: 100/min", `rate: ${50 + i * 25}/min`).replace("lte: 100", `lte: ${50 + i * 25}`),
      author: pick(["deary", "security-bot", "deary"]),
      created_at: daysAgo(count - i),
    }));

  return [
    {
      id: uuid(),
      name: "notion_read",
      description: "Read-only Notion access scoped to the main workspace",
      enforcement: "shadow",
      policy_version: 4,
      policy_yaml: NOTION_READ_YAML,
      versions: versionsFor(NOTION_READ_YAML, 4),
      updated_at: daysAgo(1),
    },
    {
      id: uuid(),
      name: "stripe_billing",
      description: "Billing reconciliation reads against Stripe",
      enforcement: "enforce",
      policy_version: 2,
      policy_yaml: STRIPE_BILLING_YAML,
      versions: versionsFor(STRIPE_BILLING_YAML, 2),
      updated_at: daysAgo(3),
    },
    {
      id: uuid(),
      name: "docs_writer",
      description: "Documentation agent; destructive tools gated on approval",
      enforcement: "enforce",
      policy_version: 1,
      policy_yaml: DOCS_WRITER_YAML,
      versions: versionsFor(DOCS_WRITER_YAML, 1),
      updated_at: daysAgo(6),
    },
  ];
}

function seedUpstreams(): UpstreamRow[] {
  return [
    {
      id: uuid(),
      name: "notion",
      kind: "mcp",
      endpoint: "https://mcp.notion.com/mcp",
      status: "ok",
      last_tools_list_at: minutesAgo(2),
      tools: [
        { name: "get_pages", description: "List pages in a workspace" },
        { name: "get_users", description: "List workspace users" },
        { name: "search", description: "Full-text search across pages" },
        { name: "create_page", description: "Create a page" },
        { name: "update_page", description: "Update page properties or content" },
        { name: "delete_page", description: "Move a page to trash" },
      ],
    },
    {
      id: uuid(),
      name: "stripe",
      kind: "http",
      endpoint: "https://api.stripe.com",
      status: "ok",
      last_tools_list_at: minutesAgo(2),
      tools: [
        { name: "get_payment_intents", description: "List payment intents" },
        { name: "get_payment_intent", description: "Fetch one payment intent" },
        { name: "get_customer", description: "Fetch a customer" },
      ],
    },
    {
      id: uuid(),
      name: "linear",
      kind: "mcp",
      endpoint: "https://mcp.linear.app/mcp",
      status: "error",
      last_tools_list_at: daysAgo(2),
      tools: [],
    },
  ];
}

const ROLE_TOOLS: Record<string, string[]> = {
  notion_read: ["notion__get_pages", "notion__get_users", "notion__search", "stripe__get_payment_intents"],
  stripe_billing: ["stripe__get_payment_intents", "stripe__get_payment_intent", "stripe__get_customer"],
  docs_writer: ["notion__get_pages", "notion__create_page", "notion__update_page", "notion__delete_page"],
};

const DENY_REASONS = [
  "constraint failed: workspace_id in [\"ws_abc123\"]",
  "tool not granted to role",
  "unexpected argument(s): include_archived",
  "constraint failed: limit lte 100",
  "rate_limited: rate limit exceeded for role:notion_read (100/60s)",
];

function decisionFor(role: string): Decision {
  const r = rand();
  if (role === "notion_read") {
    if (r < 0.78) return "allow";
    if (r < 0.92) return "shadow_deny";
    if (r < 0.97) return "deny";
    return "needs_approval";
  }
  if (role === "docs_writer") {
    if (r < 0.82) return "allow";
    if (r < 0.9) return "deny";
    return "needs_approval";
  }
  return r < 0.93 ? "allow" : "deny";
}

function argumentsFor(tool: string): Record<string, unknown> {
  if (tool.endsWith("get_pages")) return { workspace_id: rand() < 0.85 ? "ws_abc123" : "ws_evil" };
  if (tool.endsWith("search")) return { query: "[REDACTED]", workspace_id: "ws_abc123" };
  if (tool.endsWith("get_payment_intents")) return { limit: Math.ceil(rand() * 120) };
  if (tool.endsWith("get_payment_intent")) return { payment_intent_id: `pi_${hex(14)}` };
  if (tool.endsWith("get_customer")) return { customer_id: `cus_${hex(12)}` };
  if (tool.endsWith("delete_page") || tool.endsWith("update_page") || tool.endsWith("create_page"))
    return { page_id: `pg_${hex(10)}` };
  return {};
}

function seedAudit(agents: AgentRow[], roles: RoleRow[]): AuditEvent[] {
  const events: AuditEvent[] = [];
  let id = 1;
  // ~800 events across the trailing 7 days, denser recently
  for (let i = 0; i < 800; i++) {
    const agent = pick(agents);
    const role = roles.find((r) => r.name === agent.role_name)!;
    const tool = pick(ROLE_TOOLS[agent.role_name]!);
    const decision = decisionFor(agent.role_name);
    const ageMinutes = Math.floor(rand() * rand() * 7 * 24 * 60);
    events.push({
      id: id++,
      agent_id: agent.id,
      agent_name: agent.name,
      role_name: agent.role_name,
      policy_version: Math.max(1, role.policy_version - (ageMinutes > 2880 ? 1 : 0)),
      tool,
      arguments: argumentsFor(tool),
      decision,
      deny_reason:
        decision === "deny" || decision === "shadow_deny" ? pick(DENY_REASONS) : null,
      upstream_status:
        decision === "allow" || decision === "shadow_deny"
          ? rand() < 0.97
            ? "ok"
            : "timeout"
          : null,
      latency_ms:
        decision === "allow" || decision === "shadow_deny"
          ? Math.floor(40 + rand() * 860)
          : null,
      request_id: uuid(),
      created_at: minutesAgo(ageMinutes),
    });
  }
  return events.sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
  );
}

function seedApprovals(agents: AgentRow[]): Approval[] {
  const docsAgent = agents.find((a) => a.role_name === "docs_writer")!;
  const base = (overrides: Partial<Approval>): Approval => ({
    id: uuid(),
    state: "pending",
    created_at: minutesAgo(5),
    expires_at: minutesFromNow(10),
    resolved_at: null,
    approver: null,
    reason: null,
    payload: {
      agent_id: docsAgent.id,
      agent_name: docsAgent.name,
      role_name: "docs_writer",
      tool: "notion__delete_page",
      arguments: { page_id: `pg_${hex(10)}` },
      request_id: uuid(),
    },
    ...overrides,
  });

  return [
    base({ created_at: minutesAgo(3), expires_at: minutesFromNow(12) }),
    base({
      created_at: minutesAgo(13),
      expires_at: minutesFromNow(2),
      payload: {
        agent_id: docsAgent.id,
        agent_name: docsAgent.name,
        role_name: "docs_writer",
        tool: "notion__delete_page",
        arguments: { page_id: "pg_runbook_archive", recursive: true },
        request_id: uuid(),
      },
    }),
    base({
      state: "approved",
      created_at: minutesAgo(190),
      expires_at: minutesAgo(175),
      resolved_at: minutesAgo(184),
      approver: "deary",
      reason: "confirmed with docs team",
    }),
    base({
      state: "denied",
      created_at: minutesAgo(400),
      expires_at: minutesAgo(385),
      resolved_at: minutesAgo(395),
      approver: "deary",
      reason: "page is still referenced from onboarding",
    }),
    base({
      state: "expired",
      created_at: minutesAgo(900),
      expires_at: minutesAgo(885),
      resolved_at: minutesAgo(885),
      approver: null,
      reason: null,
    }),
  ];
}

function seed(): DbShape {
  const roles = seedRoles();
  const agents: AgentRow[] = [
    {
      id: uuid(),
      name: "berg-enrichment-worker",
      status: "active",
      role_name: "notion_read",
      created_at: daysAgo(21),
      last_seen_at: minutesAgo(4),
    },
    {
      id: uuid(),
      name: "billing-reconciler",
      status: "active",
      role_name: "stripe_billing",
      created_at: daysAgo(14),
      last_seen_at: minutesAgo(31),
    },
    {
      id: uuid(),
      name: "docs-crawler",
      status: "suspended",
      role_name: "docs_writer",
      created_at: daysAgo(9),
      last_seen_at: daysAgo(2),
    },
  ];
  const tokens: TokenRow[] = agents.flatMap((agent, i) => {
    const active: TokenRow = {
      id: uuid(),
      agent_id: agent.id,
      digest_prefix: hex(12),
      created_at: daysAgo(7 + i),
      expires_at: i === 1 ? daysAgo(-83) : null,
      last_used_at: agent.last_seen_at,
      revoked_at: null,
    };
    const revoked: TokenRow = {
      id: uuid(),
      agent_id: agent.id,
      digest_prefix: hex(12),
      created_at: daysAgo(20 + i),
      expires_at: null,
      last_used_at: daysAgo(8),
      revoked_at: daysAgo(7),
    };
    return i === 0 ? [active, revoked] : [active];
  });

  return {
    roles,
    agents,
    tokens,
    upstreams: seedUpstreams(),
    auditEvents: seedAudit(agents, roles),
    approvals: seedApprovals(agents),
    settings: {
      allowed_admins: ["hudson.deary@gmail.com", "security@example.com"],
      slack_webhook_url: "https://hooks.slack.com/services/T000/B000/seeded",
      redaction_defaults: ["query", "email", "customer_email"],
    },
  };
}

export let db: DbShape = seed();

export function resetDb() {
  db = seed();
}

export const mockHelpers = { uuid, hex };
