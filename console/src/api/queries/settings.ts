import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import { settingsKeys } from "../keys";
import { settingsSchema, type Settings } from "../schemas";

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.settings,
    queryFn: () => api.get(settingsSchema, "/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => api.put(settingsSchema, "/settings", settings),
    onSuccess: (data) => qc.setQueryData(settingsKeys.settings, data),
  });
}
