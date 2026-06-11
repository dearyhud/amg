import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { approvalKeys } from "../keys";
import { approvalListSchema, approvalSchema, type ApprovalState } from "../schemas";

const POLL_INTERVAL_MS = 30_000; // fallback when the SSE stream drops

export function useApprovals(state?: ApprovalState) {
  return useQuery({
    queryKey: approvalKeys.list(state),
    queryFn: () =>
      api.get(approvalListSchema, `/approvals${state ? `?state=${state}` : ""}`),
    select: (data) => data.approvals,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function usePendingApprovalCount() {
  const pending = useApprovals("pending");
  return pending.data?.length ?? 0;
}

export function useApproval(id: string) {
  return useQuery({
    queryKey: approvalKeys.detail(id),
    queryFn: () => api.get(approvalSchema, `/approvals/${id}`),
  });
}

// Resolution mutations are never optimistic; the gateway is the authority.
export function useResolveApproval(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: "approve" | "deny"; reason: string }) =>
      api.post(approvalSchema, `/approvals/${id}/${input.action}`, { reason: input.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: approvalKeys.all }),
  });
}

/*
 * Liveness: SSE stream invalidates approval queries on every event; the
 * 30s polling above keeps working when the stream drops. One-directional
 * is all this needs.
 */
export function useApprovalStream() {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource("/admin/api/approvals/stream");
    source.onmessage = () => {
      void qc.invalidateQueries({ queryKey: approvalKeys.all });
    };
    source.onerror = () => {
      // polling fallback owns it from here; EventSource auto-reconnects
    };
    return () => source.close();
  }, [qc]);
}
