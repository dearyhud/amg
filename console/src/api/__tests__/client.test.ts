import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { z } from "zod";
import { server } from "@/mocks/server";
import { api, ApiError, setCsrfToken } from "@/api/client";
import { meSchema, roleSchema } from "@/api/schemas";

describe("api client", () => {
  it("parses valid responses through the zod boundary", async () => {
    const me = await api.get(meSchema, "/me");
    expect(me.user.email).toContain("@");
    expect(me.csrf_token).toBeTruthy();
  });

  it("treats schema drift as a typed error, not silent data", async () => {
    server.use(
      http.get("/admin/api/roles/drifted", () =>
        HttpResponse.json({ id: "r1", name: "x" }), // missing required fields
      ),
    );
    await expect(api.get(roleSchema, "/roles/drifted")).rejects.toBeInstanceOf(ApiError);
  });

  it("surfaces the server error envelope with status", async () => {
    server.use(
      http.get("/admin/api/roles/nope", () =>
        HttpResponse.json({ error: "no such role" }, { status: 404 }),
      ),
    );
    const error = await api.get(roleSchema, "/roles/nope").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe("no such role");
  });

  it("sends the CSRF token on mutations", async () => {
    setCsrfToken("csrf-under-test");
    let seen: string | null = null;
    server.use(
      http.post("/admin/api/echo", ({ request }) => {
        seen = request.headers.get("X-CSRF-Token");
        return HttpResponse.json({ ok: true });
      }),
    );
    await api.post(z.object({ ok: z.literal(true) }), "/echo", {});
    expect(seen).toBe("csrf-under-test");
  });
});
