import { expect, test } from "@playwright/test";

// Flow 1: issue token → copy → dialog closes → digest-only thereafter
test("token plaintext is shown exactly once", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("agents");
  await page.getByRole("row", { name: /berg-enrichment-worker/ }).click();

  await page.getByRole("button", { name: "Issue token" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Issue token" }).click();

  const token = await page.getByTestId("issued-token").textContent();
  expect(token).toMatch(/^amg_[0-9a-f]{64}$/);
  await expect(page.getByText(/never be shown again/i)).toBeVisible();

  await page.getByRole("button", { name: "Copy" }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(token);

  await page.getByRole("button", { name: /stored it/i }).click();
  await expect(page.getByTestId("issued-token")).toBeHidden();

  // thereafter: digest prefix only, plaintext nowhere in the document
  await expect(page.locator("table")).not.toContainText(token!);
});
