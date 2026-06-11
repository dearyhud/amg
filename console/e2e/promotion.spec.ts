import { expect, test } from "@playwright/test";

// Flow 3: shadow → enforce ceremony with non-zero denials
test("promotion with shadow denials requires typing the role name", async ({ page }) => {
  await page.goto("roles");
  await page.getByRole("row", { name: /notion_read/ }).click();

  await page.getByRole("button", { name: /Shadow ▸ Enforce/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/shadow denies, trailing 7 days/)).toBeVisible();

  const promote = dialog.getByRole("button", { name: "Promote to enforce" });
  await expect(promote).toBeDisabled();

  await dialog.getByPlaceholder("notion_read").fill("notion_read");
  await expect(promote).toBeEnabled();
  await promote.click();

  await expect(page.getByText("enforce", { exact: true })).toBeVisible();
});
