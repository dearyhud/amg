import { useQuery } from "@tanstack/react-query";
import { api } from "../client";
import { dashboardKeys } from "../keys";
import { dashboardSchema } from "../schemas";

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.stats,
    queryFn: () => api.get(dashboardSchema, "/dashboard"),
    refetchInterval: 60_000,
  });
}
