import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../client";
import { auditKeys } from "../keys";
import { auditEventSchema, auditPageSchema, decisionSchema, replayResultSchema } from "../schemas";

/*
 * Audit filters live in the URL (TanStack Router search params) so any
 * filtered view is a shareable link. This schema is the round-trip contract.
 */
export const auditFiltersSchema = z.object({
  agent: z.string().optional().catch(undefined),
  role: z.string().optional().catch(undefined),
  tool: z.string().optional().catch(undefined),
  decision: decisionSchema.optional().catch(undefined),
  range: z.enum(["1h", "24h", "7d", "30d", "all"]).optional().catch(undefined),
  request_id: z.string().optional().catch(undefined),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

function toQueryString(filters: AuditFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "100");
  return params.toString();
}

export function useAuditEvents(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: auditKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api.get(auditPageSchema, `/audit_events?${toQueryString(filters, pageParam)}`),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}

export function useAuditEvent(id: string) {
  return useQuery({
    queryKey: auditKeys.detail(id),
    queryFn: () => api.get(auditEventSchema, `/audit_events/${id}`),
  });
}

// Replay re-runs the decision against the recorded policy version —
// pure diagnostics, never forwards upstream.
export function useReplayAuditEvent(id: string) {
  return useMutation({
    mutationFn: () => api.post(replayResultSchema, `/audit_events/${id}/replay`, {}),
  });
}
