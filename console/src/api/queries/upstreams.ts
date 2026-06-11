import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../client";
import { upstreamKeys } from "../keys";
import { upstreamDetailSchema, upstreamSchema } from "../schemas";

export function useUpstreams() {
  return useQuery({
    queryKey: upstreamKeys.list(),
    queryFn: () =>
      api.get(z.object({ upstreams: z.array(upstreamSchema) }), "/upstreams"),
    select: (data) => data.upstreams,
  });
}

export function useUpstream(id: string) {
  return useQuery({
    queryKey: upstreamKeys.detail(id),
    queryFn: () => api.get(upstreamDetailSchema, `/upstreams/${id}`),
  });
}

export function useCreateUpstream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; kind: "mcp" | "http"; endpoint: string; vault_path: string }) =>
      api.post(upstreamSchema, "/upstreams", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: upstreamKeys.all }),
  });
}
