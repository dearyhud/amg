import type { z } from "zod";

const BASE = "/admin/api";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// CSRF token arrives with /me and rides every mutating request.
let csrfToken: string | null = null;
export function setCsrfToken(token: string) {
  csrfToken = token;
}

async function request<S extends z.ZodTypeAny>(
  schema: S,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<z.infer<S>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = undefined;
    }
    const message =
      detail && typeof detail === "object" && "error" in detail
        ? String((detail as { error: unknown }).error)
        : `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, detail);
  }

  const json: unknown = res.status === 204 ? undefined : await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // A parse failure is a bug: loud in dev, typed error state in prod.
    if (import.meta.env.DEV) {
      console.error(`API response failed validation: ${method} ${path}`, parsed.error, json);
    }
    throw new ApiError(`response validation failed for ${path}`, res.status, parsed.error);
  }
  return parsed.data;
}

export const api = {
  get: <S extends z.ZodTypeAny>(schema: S, path: string) => request(schema, "GET", path),
  post: <S extends z.ZodTypeAny>(schema: S, path: string, body?: unknown) =>
    request(schema, "POST", path, body),
  put: <S extends z.ZodTypeAny>(schema: S, path: string, body?: unknown) =>
    request(schema, "PUT", path, body),
};
