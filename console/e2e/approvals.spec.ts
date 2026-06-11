import { expect, test } from "@playwright/test";

// Flow 4: approval resolve → audit event appears
test("approving a parked call requires a reason and lands in the audit log", async ({ page }) => {
  await page.goto("approvals");
  await page
    .locator("a", { hasText: "notion__delete_page" })
    .first()
    .click();

  await expect(page.getByText(/cannot be edited/)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Approve and forward" });
  await expect(confirm).toBeDisabled(); // reason is required

  await dialog.getByLabel(/Reason/).fill("confirmed in #docs");
  await confirm.click();

  await expect(page.getByText("approved")).toBeVisible();

  // the resolution shows up in the audit explorer
  await page.goto("audit?decision=allow&tool=delete_page");
  await expect(page.getByTestId("audit-row").first()).toContainText("notion__delete_page");
});
