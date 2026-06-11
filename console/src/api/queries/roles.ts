import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../client";
import { roleKeys } from "../keys";
import {
  compileResultSchema,
  roleDetailSchema,
  roleSchema,
  shadowStatsSchema,
} from "../schemas";

export function useRoles() {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: () => api.get(z.object({ roles: z.array(roleSchema) }), "/roles"),
    select: (data) => data.roles,
  });
}

export function useRole(id: string) {
  return useQuery({
    queryKey: roleKeys.detail(id),
    queryFn: () => api.get(roleDetailSchema, `/roles/${id}`),
  });
}

export function useShadowStats(id: string, enabled = true) {
  return useQuery({
    queryKey: roleKeys.shadowStats(id),
    queryFn: () => api.get(shadowStatsSchema, `/roles/${id}/shadow_stats`),
    enabled,
  });
}

// The server-side Ruby compiler is the single source of truth for validity.
export function useCompilePolicy() {
  return useMutation({
    mutationFn: (yaml: string) =>
      api.post(compileResultSchema, "/policies/compile", { policy_yaml: yaml }),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { policy_yaml: string; description?: string }) =>
      api.post(roleDetailSchema, "/roles", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  });
}

export function useSaveRoleVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { policy_yaml: string }) =>
      api.put(roleDetailSchema, `/roles/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  });
}

// Enforcement changes are never optimistic — the UI waits for the server.
export function usePromoteRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { confirm_name?: string }) =>
      api.post(roleDetailSchema, `/roles/${id}/promote`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  });
}

export function useDemoteRole(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(roleDetailSchema, `/roles/${id}/demote`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: roleKeys.all }),
  });
}
