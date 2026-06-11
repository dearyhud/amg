import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// Simple password auth (v1): the server sets an httpOnly session cookie and
// returns the same payload as /me. The password itself never persists
// anywhere client-side.
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.post(meSchema, "/auth/login", { password }),
    onSuccess: (me) => {
      setCsrfToken(me.csrf_token);
      qc.setQueryData(meKeys.me, me);
    },
  });
}
