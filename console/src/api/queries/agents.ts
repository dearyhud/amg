import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../client";
import { agentKeys } from "../keys";
import { agentDetailSchema, agentSchema, okSchema } from "../schemas";

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => api.get(z.object({ agents: z.array(agentSchema) }), "/agents"),
    select: (data) => data.agents,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => api.get(agentDetailSchema, `/agents/${id}`),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; role: string }) =>
      api.post(agentSchema, "/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useSetAgentStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: "active" | "suspended") =>
      api.post(okSchema, `/agents/${id}/${status === "active" ? "activate" : "suspend"}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

// Token issuance deliberately has no useMutation hook: the plaintext must
// only ever exist in the issuance dialog's component state, never in any
// cache. See IssueTokenDialog, which calls the api client directly.

export function useRevokeToken(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => api.post(okSchema, `/tokens/${tokenId}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.detail(agentId) }),
  });
}
