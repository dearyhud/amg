import { useQuery } from "@tanstack/react-query";
import { api, setCsrfToken } from "../client";
import { meKeys } from "../keys";
import { meSchema } from "../schemas";

export function useMe() {
  return useQuery({
    queryKey: meKeys.me,
    queryFn: async () => {
      const me = await api.get(meSchema, "/me");
      setCsrfToken(me.csrf_token);
      return me;
    },
    staleTime: Infinity,
    retry: false,
  });
}
