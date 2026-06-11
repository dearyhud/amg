import { http, HttpResponse } from "msw";
import { db, mockHelpers, type RoleRow } from "./db";
import { compilePolicy } from "./compile";
import type { Approval, AuditEvent } from "@/api/schemas";

const API = "/admin/api";
const now = () => new Date().toISOString();

// -- serializers (mirror the Ruby side) ---------------------------------------

function serializeRole(role: RoleRow) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    enforcement: role.enforcement,
    policy_version: role.policy_version,
    updated_at: role.updated_at,
    agent_count: db.agents.filter((a) => a.role_name === role.name).length,
  };
}

function serializeRoleDetail(role: RoleRow) {
  return { ...serializeRole(role), policy_yaml: role.policy_yaml, versions: role.versions };
}

function serializeAgent(agent: (typeof db.agents)[number]) {
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    role: agent.role_name,
    created_at: agent.created_at,
    last_seen_at: agent.last_seen_at,
    token_count: db.tokens.filter((t) => t.agent_id === agent.id && !t.revoked_at).length,
  };
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    dayKey(new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString()),
  );
}

function expirePending(approval: Approval): Approval {
  if (approval.state === "pending" && new Date(approval.expires_at).getTime() < Date.now()) {
    approval.state = "expired";
    approval.resolved_at = approval.expires_at;
  }
  return approval;
}

// -- handlers ------------------------------------------------------------------

export const handlers = [
  // session
  http.get(`${API}/me`, () =>
    HttpResponse.json({
      user: { email: "hudson.deary@gmail.com", name: "Deary" },
      csrf_token: "mock-csrf-token",
    }),
  ),

  // roles
  http.get(`${API}/roles`, () =>
    HttpResponse.json({ roles: db.roles.map(serializeRole) }),
  ),

  http.get(`${API}/roles/:id`, ({ params }) => {
    const role = db.roles.find((r) => r.id === params.id || r.name === params.id);
    if (!role) return HttpResponse.json({ error: "no such role" }, { status: 404 });
    return HttpResponse.json(serializeRoleDetail(role));
  }),

  http.post(`${API}/policies/compile`, async ({ request }) => {
    const { policy_yaml } = (await request.json()) as { policy_yaml: string };
    return HttpResponse.json(compilePolicy(policy_yaml ?? ""));
  }),

  http.post(`${API}/roles`, async ({ request }) => {
    const body = (await request.json()) as { policy_yaml: string; description?: string };
    const result = compilePolicy(body.policy_yaml);
    if (!result.ok) {
      return HttpResponse.json({ error: result.errors[0]?.message ?? "invalid policy" }, { status: 422 });
    }
    if (db.roles.some((r) => r.name === result.compiled.role)) {
      return HttpResponse.json({ error: `role ${result.compiled.role} already exists` }, { status: 409 });
    }
    const role: RoleRow = {
      id: mockHelpers.uuid(),
      name: result.compiled.role,
      description: body.description ?? null,
      enforcement: result.compiled.enforcement,
      policy_version: 1,
      policy_yaml: body.policy_yaml,
      versions: [{ version: 1, yaml: body.policy_yaml, author: "deary", created_at: now() }],
      updated_at: now(),
    };
    db.roles.push(role);
    return HttpResponse.json(serializeRoleDetail(role), { status: 201 });
  }),

  http.put(`${API}/roles/:id`, async ({ params, request }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) return HttpResponse.json({ error: "no such role" }, { status: 404 });
    const body = (await request.json()) as { policy_yaml: string };
    const result = compilePolicy(body.policy_yaml);
    if (!result.ok) {
      return HttpResponse.json({ error: result.errors[0]?.message ?? "invalid policy" }, { status: 422 });
    }
    if (result.compiled.role !== role.name) {
      return HttpResponse.json(
        { error: `policy role ${JSON.stringify(result.compiled.role)} does not match ${JSON.stringify(role.name)}` },
        { status: 422 },
      );
    }
    role.policy_version += 1;
    role.policy_yaml = body.policy_yaml;
    role.enforcement = result.compiled.enforcement;
    role.versions.push({
      version: role.policy_version,
      yaml: body.policy_yaml,
      author: "deary",
      created_at: now(),
    });
    role.updated_at = now();
    return HttpResponse.json(serializeRoleDetail(role));
  }),

  http.post(`${API}/roles/:id/promote`, async ({ params, request }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) return HttpResponse.json({ error: "no such role" }, { status: 404 });
    const body = (await request.json()) as { confirm_name?: string };
    const shadowDenies = db.auditEvents.filter(
      (e) => e.role_name === role.name && e.decision === "shadow_deny",
    ).length;
    if (shadowDenies > 0 && body.confirm_name !== role.name) {
      return HttpResponse.json(
        { error: "role has shadow denials; confirmation name required" },
        { status: 422 },
      );
    }
    role.enforcement = "enforce";
    role.policy_yaml = role.policy_yaml.replace("enforcement: shadow", "enforcement: enforce");
    role.updated_at = now();
    return HttpResponse.json(serializeRoleDetail(role));
  }),

  http.post(`${API}/roles/:id/demote`, ({ params }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) return HttpResponse.json({ error: "no such role" }, { status: 404 });
    role.enforcement = "shadow";
    role.policy_yaml = role.policy_yaml.replace("enforcement: enforce", "enforcement: shadow");
    role.updated_at = now();
    return HttpResponse.json(serializeRoleDetail(role));
  }),

  http.get(`${API}/roles/:id/shadow_stats`, ({ params }) => {
    const role = db.roles.find((r) => r.id === params.id);
    if (!role) return HttpResponse.json({ error: "no such role" }, { status: 404 });
    const days = lastNDays(7).map((date) => {
      const dayEvents = db.auditEvents.filter(
        (e) => e.role_name === role.name && dayKey(e.created_at) === date,
      );
      return {
        date,
        shadow_denies: dayEvents.filter((e) => e.decision === "shadow_deny").length,
        total: dayEvents.length,
      };
    });
    return HttpResponse.json({
      days,
      total_shadow_denies: days.reduce((sum, d) => sum + d.shadow_denies, 0),
    });
  }),

  // agents & tokens
  http.get(`${API}/agents`, () =>
    HttpResponse.json({ agents: db.agents.map(serializeAgent) }),
  ),

  http.get(`${API}/agents/:id`, ({ params }) => {
    const agent = db.agents.find((a) => a.id === params.id);
    if (!agent) return HttpResponse.json({ error: "no such agent" }, { status: 404 });
    const activity = lastNDays(30).map((date) => {
      const dayEvents = db.auditEvents.filter(
        (e) => e.agent_id === agent.id && dayKey(e.created_at) === date,
      );
      const count = (d: AuditEvent["decision"]) => dayEvents.filter((e) => e.decision === d).length;
      return {
        date,
        allow: count("allow"),
        deny: count("deny"),
        shadow_deny: count("shadow_deny"),
        needs_approval: count("needs_approval"),
      };
    });
    return HttpResponse.json({
      ...serializeAgent(agent),
      tokens: db.tokens.filter((t) => t.agent_id === agent.id),
      activity,
    });
  }),

  http.post(`${API}/agents`, async ({ request }) => {
    const body = (await request.json()) as { name: string; role: string };
    if (!db.roles.some((r) => r.name === body.role)) {
      return HttpResponse.json({ error: `no such role: ${body.role}` }, { status: 422 });
    }
    if (db.agents.some((a) => a.name === body.name)) {
      return HttpResponse.json({ error: `agent ${body.name} already exists` }, { status: 409 });
    }
    const agent = {
      id: mockHelpers.uuid(),
      name: body.name,
      status: "active" as const,
      role_name: body.role,
      created_at: now(),
      last_seen_at: null,
    };
    db.agents.push(agent);
    return HttpResponse.json(serializeAgent(agent), { status: 201 });
  }),

  http.post(`${API}/agents/:id/suspend`, ({ params }) => {
    const agent = db.agents.find((a) => a.id === params.id);
    if (!agent) return HttpResponse.json({ error: "no such agent" }, { status: 404 });
    agent.status = "suspended";
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${API}/agents/:id/activate`, ({ params }) => {
    const agent = db.agents.find((a) => a.id === params.id);
    if (!agent) return HttpResponse.json({ error: "no such agent" }, { status: 404 });
    agent.status = "active";
    return HttpResponse.json({ ok: true });
  }),

  http.post(`${API}/agents/:id/tokens`, async ({ params, request }) => {
    const agent = db.agents.find((a) => a.id === params.id);
    if (!agent) return HttpResponse.json({ error: "no such agent" }, { status: 404 });
    const body = (await request.json()) as { expires_in?: string };
    const token = `amg_${mockHelpers.hex(64)}`;
    const expiresAt = body.expires_in
      ? new Date(Date.now() + parseExpiry(body.expires_in)).toISOString()
      : null;
    const row = {
      id: mockHelpers.uuid(),
      agent_id: agent.id,
      digest_prefix: token.slice(4, 16),
      created_at: now(),
      expires_at: expiresAt,
      last_used_at: null,
      revoked_at: null,
    };
    db.tokens.push(row);
    // plaintext leaves the server exactly once
    return HttpResponse.json({ token_id: row.id, token }, { status: 201 });
  }),

  http.post(`${API}/tokens/:id/revoke`, ({ params }) => {
    const token = db.tokens.find((t) => t.id === params.id);
    if (!token) return HttpResponse.json({ error: "no such token" }, { status: 404 });
    token.revoked_at = now();
    return HttpResponse.json({ ok: true });
  }),

  // upstreams
  http.get(`${API}/upstreams`, () =>
    HttpResponse.json({
      upstreams: db.upstreams.map(({ tools, ...u }) => ({ ...u, tool_count: tools.length })),
    }),
  ),

  http.get(`${API}/upstreams/:id`, ({ params }) => {
    const upstream = db.upstreams.find((u) => u.id === params.id);
    if (!upstream) return HttpResponse.json({ error: "no such upstream" }, { status: 404 });
    const { tools, ...u } = upstream;
    return HttpResponse.json({ ...u, tool_count: tools.length, tools });
  }),

  http.post(`${API}/upstreams`, async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      kind: "mcp" | "http";
      endpoint: string;
      vault_path: string;
    };
    const upstream = {
      id: mockHelpers.uuid(),
      name: body.name,
      kind: body.kind,
      endpoint: body.endpoint,
      status: "unknown" as const,
      last_tools_list_at: null,
      tools: [],
    };
    db.upstreams.push(upstream);
    const { tools, ...u } = upstream;
    return HttpResponse.json({ ...u, tool_count: tools.length }, { status: 201 });
  }),

  // audit: server-side filtering + keyset pagination, never OFFSET
  http.get(`${API}/audit_events`, ({ request }) => {
    const url = new URL(request.url);
    const params = url.searchParams;
    let events = db.auditEvents;

    const agent = params.get("agent");
    if (agent) events = events.filter((e) => e.agent_name === agent);
    const role = params.get("role");
    if (role) events = events.filter((e) => e.role_name === role);
    const tool = params.get("tool");
    if (tool) events = events.filter((e) => e.tool.includes(tool));
    const decision = params.get("decision");
    if (decision) events = events.filter((e) => e.decision === decision);
    const requestId = params.get("request_id");
    if (requestId) events = events.filter((e) => e.request_id.startsWith(requestId));
    const range = params.get("range");
    if (range && range !== "all") {
      const ms = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 }[range];
      if (ms) {
        const cutoff = new Date(Date.now() - ms).toISOString();
        events = events.filter((e) => e.created_at >= cutoff);
      }
    }

    const cursor = params.get("cursor");
    if (cursor) {
      const [createdAt, idStr] = atob(cursor).split("|");
      const id = Number(idStr);
      events = events.filter(
        (e) => e.created_at < createdAt! || (e.created_at === createdAt && e.id < id),
      );
    }

    const limit = Math.min(Number(params.get("limit") ?? 100), 500);
    const page = events.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      events.length > limit && last ? btoa(`${last.created_at}|${last.id}`) : null;

    return HttpResponse.json({ events: page, next_cursor: nextCursor });
  }),

  http.get(`${API}/audit_events/:id`, ({ params }) => {
    const event = db.auditEvents.find((e) => String(e.id) === params.id);
    if (!event) return HttpResponse.json({ error: "no such event" }, { status: 404 });
    return HttpResponse.json(event);
  }),

  http.post(`${API}/audit_events/:id/replay`, ({ params }) => {
    const event = db.auditEvents.find((e) => String(e.id) === params.id);
    if (!event) return HttpResponse.json({ error: "no such event" }, { status: 404 });
    // replay against the recorded policy version; shadow_deny replays as the
    // deny it would have been under enforce
    return HttpResponse.json({
      verdict: event.decision === "shadow_deny" ? "deny" : event.decision,
      reason: event.deny_reason,
      policy_version: event.policy_version,
    });
  }),

  // approvals
  http.get(`${API}/approvals`, ({ request }) => {
    const state = new URL(request.url).searchParams.get("state");
    let approvals = db.approvals.map(expirePending);
    if (state) approvals = approvals.filter((a) => a.state === state);
    return HttpResponse.json({
      approvals: [...approvals].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    });
  }),

  http.get(`${API}/approvals/:id`, ({ params }) => {
    const approval = db.approvals.find((a) => a.id === params.id);
    if (!approval) return HttpResponse.json({ error: "no such approval" }, { status: 404 });
    return HttpResponse.json(expirePending(approval));
  }),

  http.post(`${API}/approvals/:id/approve`, async ({ params, request }) =>
    resolveApproval(String(params.id), "approved", request),
  ),

  http.post(`${API}/approvals/:id/deny`, async ({ params, request }) =>
    resolveApproval(String(params.id), "denied", request),
  ),

  // SSE: one-directional liveness for the queue + sidebar badge
  http.get(`${API}/approvals/stream`, () => {
    let interval: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("retry: 10000\n\n"));
        interval = setInterval(() => {
          controller.enqueue(encoder.encode(`data: {"type":"tick"}\n\n`));
        }, 30_000);
      },
      cancel() {
        clearInterval(interval);
      },
    });
    return new HttpResponse(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }),

  // dashboard
  http.get(`${API}/dashboard`, () => {
    const days = lastNDays(7);
    const byDay = days.map((date) => {
      const dayEvents = db.auditEvents.filter((e) => dayKey(e.created_at) === date);
      const count = (d: AuditEvent["decision"]) => dayEvents.filter((e) => e.decision === d).length;
      return {
        date,
        allow: count("allow"),
        deny: count("deny"),
        shadow_deny: count("shadow_deny"),
        needs_approval: count("needs_approval"),
      };
    });

    const shadowRates = db.roles
      .filter((r) => r.enforcement === "shadow")
      .map((role) => ({
        role: role.name,
        points: days.map((date) => {
          const dayEvents = db.auditEvents.filter(
            (e) => e.role_name === role.name && dayKey(e.created_at) === date,
          );
          return {
            date,
            denies: dayEvents.filter((e) => e.decision === "shadow_deny").length,
            total: dayEvents.length,
          };
        }),
      }));

    const denied = db.auditEvents.filter(
      (e) => e.decision === "deny" || e.decision === "shadow_deny",
    );
    const countBy = <K extends string>(items: { [k in K]: string | null }[], key: K) => {
      const counts = new Map<string, number>();
      for (const item of items) {
        const value = item[key];
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    };

    const resolved = db.approvals.filter((a) => a.resolved_at && a.state !== "expired");
    const resolutionMinutes = resolved
      .map((a) => (new Date(a.resolved_at!).getTime() - new Date(a.created_at).getTime()) / 60_000)
      .sort((a, b) => a - b);

    return HttpResponse.json({
      decisions_by_day: byDay,
      shadow_rates: shadowRates,
      top_denied_tools: countBy(denied, "tool").map(([tool, count]) => ({ tool, count })),
      top_deny_reasons: countBy(denied, "deny_reason").map(([reason, count]) => ({ reason, count })),
      approvals: {
        pending: db.approvals.map(expirePending).filter((a) => a.state === "pending").length,
        median_resolution_minutes:
          resolutionMinutes.length > 0
            ? Math.round(resolutionMinutes[Math.floor(resolutionMinutes.length / 2)]!)
            : null,
      },
      upstream_health: db.upstreams.map((u) => ({
        name: u.name,
        kind: u.kind,
        status: u.status,
        last_tools_list_at: u.last_tools_list_at,
      })),
    });
  }),

  // settings
  http.get(`${API}/settings`, () => HttpResponse.json(db.settings)),

  http.put(`${API}/settings`, async ({ request }) => {
    db.settings = (await request.json()) as typeof db.settings;
    return HttpResponse.json(db.settings);
  }),
];

async function resolveApproval(id: string, state: "approved" | "denied", request: Request) {
  const approval = db.approvals.find((a) => a.id === id);
  if (!approval) return HttpResponse.json({ error: "no such approval" }, { status: 404 });
  expirePending(approval);
  if (approval.state !== "pending") {
    return HttpResponse.json({ error: `approval is ${approval.state}, not pending` }, { status: 422 });
  }
  const body = (await request.json()) as { reason?: string };
  if (!body.reason?.trim()) {
    return HttpResponse.json({ error: "reason is required" }, { status: 422 });
  }
  approval.state = state;
  approval.approver = "deary";
  approval.reason = body.reason;
  approval.resolved_at = now();

  // resolution lands in the audit trail
  const maxId = db.auditEvents[0]?.id ?? 0;
  db.auditEvents.unshift({
    id: maxId + 1,
    agent_id: approval.payload.agent_id,
    agent_name: approval.payload.agent_name,
    role_name: approval.payload.role_name,
    policy_version: db.roles.find((r) => r.name === approval.payload.role_name)?.policy_version ?? 1,
    tool: approval.payload.tool,
    arguments: approval.payload.arguments,
    decision: state === "approved" ? "allow" : "deny",
    deny_reason: state === "denied" ? `approval denied: ${body.reason}` : null,
    upstream_status: state === "approved" ? "ok" : null,
    latency_ms: state === "approved" ? 312 : null,
    request_id: approval.payload.request_id,
    created_at: now(),
  });

  return HttpResponse.json(approval);
}

function parseExpiry(value: string): number {
  const m = /^(\d+)(d|h)$/.exec(value);
  if (!m) return 30 * 86_400_000;
  return Number(m[1]) * (m[2] === "d" ? 86_400_000 : 3_600_000);
}
