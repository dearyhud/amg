import type { AuditFilters } from "./queries/audit";

/*
 * Factory-built query keys: invalidation is mechanical, not stringly-typed.
 */

export const meKeys = {
  me: ["me"] as const,
};

export const roleKeys = {
  all: ["roles"] as const,
  list: () => [...roleKeys.all, "list"] as const,
  detail: (id: string) => [...roleKeys.all, "detail", id] as const,
  shadowStats: (id: string) => [...roleKeys.all, "shadow-stats", id] as const,
};

export const agentKeys = {
  all: ["agents"] as const,
  list: () => [...agentKeys.all, "list"] as const,
  detail: (id: string) => [...agentKeys.all, "detail", id] as const,
};

export const upstreamKeys = {
  all: ["upstreams"] as const,
  list: () => [...upstreamKeys.all, "list"] as const,
  detail: (id: string) => [...upstreamKeys.all, "detail", id] as const,
};

export const auditKeys = {
  all: ["audit"] as const,
  list: (filters: AuditFilters) => [...auditKeys.all, "list", filters] as const,
  detail: (id: string) => [...auditKeys.all, "detail", id] as const,
};

export const approvalKeys = {
  all: ["approvals"] as const,
  list: (state?: string) => [...approvalKeys.all, "list", state ?? "all"] as const,
  detail: (id: string) => [...approvalKeys.all, "detail", id] as const,
};

export const dashboardKeys = {
  stats: ["dashboard"] as const,
};

export const settingsKeys = {
  settings: ["settings"] as const,
};
