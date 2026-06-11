import { describe, expect, it } from "vitest";
import { auditFiltersSchema, type AuditFilters } from "@/api/queries/audit";

/*
 * Filters → URL → filters must round-trip exactly: filtered audit views
 * are shareable links and the URL is the source of truth.
 */
describe("audit filter search params", () => {
  it("round-trips through URLSearchParams", () => {
    const filters: AuditFilters = {
      agent: "berg-enrichment-worker",
      role: "notion_read",
      tool: "notion__get_pages",
      decision: "shadow_deny",
      range: "7d",
      request_id: "abc123",
    };

    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v != null) as [string, string][],
    );
    const parsed = auditFiltersSchema.parse(Object.fromEntries(params));
    expect(parsed).toEqual(filters);
  });

  it("accepts an empty search", () => {
    expect(auditFiltersSchema.parse({})).toEqual({});
  });

  it("drops invalid values instead of crashing the route", () => {
    const parsed = auditFiltersSchema.parse({
      decision: "exfiltrate",
      range: "1y",
      agent: "ok-agent",
    });
    expect(parsed.decision).toBeUndefined();
    expect(parsed.range).toBeUndefined();
    expect(parsed.agent).toBe("ok-agent");
  });
});
