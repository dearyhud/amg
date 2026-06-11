import { parseDocument } from "yaml";
import type { CompiledPolicy, CompileError, CompileResult } from "@/api/schemas";
import { db } from "./db";

/*
 * TS mirror of the Ruby Policy::Compiler, for the mock API only. In
 * production /policies/compile runs the real Ruby compiler — the single
 * source of truth. This mirror exists so dev mode exercises the same
 * error surface (line-anchored diagnostics, unknown-tool checks).
 */

const SEGMENT = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const TOOL_NAME = /^[a-z0-9_]+$/;
const GLOB = /^[a-z0-9_*?]+$/;
const RATE = /^(\d+)\/(sec|s|min|m|hour|hr|h)$/;
const DURATION = /^(\d+)(s|m|h)$/;
const OPERATORS = new Set(["eq", "in", "lte", "gte", "matches", "absent"]);
const PERIODS: Record<string, number> = { sec: 1, s: 1, min: 60, m: 60, hour: 3600, hr: 3600, h: 3600 };

function findLine(source: string, needle: string): number | null {
  const lines = source.split("\n");
  const idx = lines.findIndex((l) => l.includes(needle));
  return idx === -1 ? null : idx + 1;
}

export function compilePolicy(source: string): CompileResult {
  const errors: CompileError[] = [];
  const err = (message: string, needle?: string) =>
    errors.push({ message, line: needle ? findLine(source, needle) : null, column: null });

  const doc = parseDocument(source);
  if (doc.errors.length > 0) {
    return {
      ok: false,
      errors: doc.errors.map((e) => ({
        message: e.message.split("\n")[0] ?? "YAML parse error",
        line: e.linePos?.[0]?.line ?? null,
        column: e.linePos?.[0]?.col ?? null,
      })),
    };
  }

  const raw = doc.toJS() as unknown;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ message: "policy must be a YAML mapping", line: 1, column: null }] };
  }
  const policy = raw as Record<string, unknown>;

  const role = String(policy.role ?? "");
  if (!role) err("role is required");

  const enforcement = String(policy.enforcement ?? "enforce");
  if (!["enforce", "shadow"].includes(enforcement)) {
    err(`enforcement must be one of: enforce, shadow`, "enforcement:");
  }

  const servers: CompiledPolicy["servers"] = {};
  if (policy.servers === undefined || policy.servers === null || typeof policy.servers !== "object" || Array.isArray(policy.servers)) {
    err("servers must be a mapping");
  } else {
    for (const [server, cfg] of Object.entries(policy.servers as Record<string, unknown>)) {
      if (!SEGMENT.test(server)) err(`invalid server name ${JSON.stringify(server)}`, `${server}:`);
      const tools = (cfg as { tools?: unknown } | null)?.tools;
      if (!Array.isArray(tools)) {
        err(`server ${server} must define tools`, `${server}:`);
        continue;
      }
      const upstream = db.upstreams.find((u) => u.name === server);
      servers[server] = {
        tools: tools.map((t) => compileTool(server, t, upstream?.tools.map((x) => x.name), err)),
      };
    }
  }

  const limits: CompiledPolicy["limits"] = {};
  if (policy.limits !== undefined && policy.limits !== null) {
    const l = policy.limits as Record<string, unknown>;
    for (const key of ["rate", "per_agent"] as const) {
      if (l[key] !== undefined) {
        const m = RATE.exec(String(l[key]));
        if (!m) err(`invalid rate ${JSON.stringify(l[key])} (expected e.g. "100/min")`, `${key}:`);
        else limits[key] = { limit: Number(m[1]), period: PERIODS[m[2]!]! };
      }
    }
  }

  const approvals: CompiledPolicy["approvals"] = [];
  if (policy.approvals !== undefined && policy.approvals !== null) {
    if (!Array.isArray(policy.approvals)) {
      err("approvals must be a list", "approvals:");
    } else {
      for (const rule of policy.approvals as Record<string, unknown>[]) {
        const match = String(rule?.match ?? "");
        if (!GLOB.test(match)) err(`invalid approval match pattern ${JSON.stringify(match)}`, "match:");
        if (String(rule?.require ?? "") !== "human") {
          err(`approval require must be "human" (got ${JSON.stringify(rule?.require)})`, "require:");
        }
        const timeoutRaw = rule?.timeout === undefined ? "15m" : String(rule.timeout);
        const tm = DURATION.exec(timeoutRaw);
        if (!tm) err(`invalid duration ${JSON.stringify(rule?.timeout)} (expected e.g. "15m")`, "timeout:");
        approvals.push({
          match,
          require: "human",
          timeout: tm ? Number(tm[1]) * PERIODS[tm[2]!]! : 900,
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    compiled: {
      role,
      enforcement: enforcement as CompiledPolicy["enforcement"],
      servers,
      limits,
      approvals,
    },
  };
}

function compileTool(
  server: string,
  tool: unknown,
  upstreamTools: string[] | undefined,
  err: (message: string, needle?: string) => void,
) {
  const t = (typeof tool === "string" ? { name: tool } : tool) as Record<string, unknown>;
  const name = String(t?.name ?? "");
  if (!TOOL_NAME.test(name)) err(`invalid tool name ${JSON.stringify(name)}`, "name:");
  // mirrors the backend's save-time check against the live tools/list
  if (upstreamTools && name && !upstreamTools.includes(name)) {
    err(`unknown tool ${server}__${name} (not in upstream tools/list)`, `name: ${name}`);
  }

  const compiled: { name: string; constraints?: Record<string, Record<string, unknown>>; allow_args?: string[]; redact?: string[] } = { name };

  if (t?.constraints !== undefined && t.constraints !== null) {
    const constraints = t.constraints as Record<string, Record<string, unknown>>;
    for (const [arg, ops] of Object.entries(constraints)) {
      if (ops === null || typeof ops !== "object" || Array.isArray(ops)) {
        err(`constraint on ${arg} must map operator to operand`, `${arg}:`);
        continue;
      }
      for (const [op, expected] of Object.entries(ops)) {
        if (!OPERATORS.has(op)) {
          err(`unknown constraint operator ${JSON.stringify(op)} on ${server}__${name}.${arg}`, `${op}:`);
        } else if (op === "in" && !Array.isArray(expected)) {
          err(`\`in\` operand at ${server}__${name}.${arg} must be an array`, "in:");
        } else if ((op === "lte" || op === "gte") && typeof expected !== "number") {
          err(`\`${op}\` operand at ${server}__${name}.${arg} must be numeric`, `${op}:`);
        } else if (op === "matches") {
          try {
            new RegExp(String(expected));
          } catch (e) {
            err(`invalid regex at ${server}__${name}.${arg}: ${(e as Error).message}`, "matches:");
          }
        } else if (op === "absent" && expected !== true) {
          err(`\`absent\` operand at ${server}__${name}.${arg} must be true`, "absent:");
        }
      }
    }
    compiled.constraints = constraints;
  }
  if (t?.allow_args !== undefined) compiled.allow_args = (t.allow_args as unknown[]).map(String);
  if (t?.redact !== undefined) compiled.redact = (t.redact as unknown[]).map(String);
  return compiled;
}
