import { describe, expect, it } from "vitest";
import { compilePolicy } from "@/mocks/compile";
import { compileResultSchema } from "@/api/schemas";
import { NOTION_READ_YAML } from "@/mocks/db";

/*
 * Contract test: the mock compiler's output must satisfy the same zod
 * schema the client applies to the real Ruby compiler's responses.
 */
describe("mock policy compiler", () => {
  it("compiles the seeded policy and satisfies the response schema", () => {
    const result = compilePolicy(NOTION_READ_YAML);
    expect(compileResultSchema.parse(result)).toEqual(result);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.compiled.servers)).toContain("notion");
      expect(result.compiled.approvals[0]).toMatchObject({ match: "*delete*", timeout: 900 });
    }
  });

  it("anchors YAML syntax errors to a line", () => {
    const result = compilePolicy("role: x\n  bad: indent\n");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.line).not.toBeNull();
  });

  it("rejects unknown operators and unknown tools like the backend", () => {
    const bad = NOTION_READ_YAML.replace("in:", "contains:");
    const result = compilePolicy(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes("unknown constraint operator"))).toBe(true);
    }

    const ghost = NOTION_READ_YAML.replace("name: get_users", "name: get_userz");
    const ghostResult = compilePolicy(ghost);
    expect(ghostResult.ok).toBe(false);
    if (!ghostResult.ok) {
      expect(ghostResult.errors.some((e) => e.message.includes("unknown tool notion__get_userz"))).toBe(true);
    }
  });
});
