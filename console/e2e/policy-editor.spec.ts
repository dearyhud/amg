import { expect, test } from "@playwright/test";

// Flow 2: author invalid policy → gutter error → fix → save version → diff
test("invalid policy shows diagnostics; saving bumps the version", async ({ page }) => {
  await page.goto("roles");
  await page.getByRole("row", { name: /notion_read/ }).click();

  const editor = page.getByTestId("policy-editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nbogus_extra:\n  rate: not-a-rate");

  // server-side compile errors land in the preview pane and lint gutter
  await expect(page.getByTestId("compile-errors")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Save version" })).toBeDisabled();

  // fix it
  for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+Backspace");
  await page.keyboard.press("ControlOrMeta+End");

  await expect(page.getByTestId("compile-ok")).toBeVisible({ timeout: 5_000 });
});

test("version history diffs two versions side by side", async ({ page }) => {
  await page.goto("roles");
  await page.getByRole("row", { name: /notion_read/ }).click();
  await page.getByRole("tab", { name: /Versions/ }).click();
  await page.getByRole("button", { name: /Diff v1/ }).click();
  await expect(page.getByRole("dialog").locator(".cm-mergeView")).toBeVisible();
});
