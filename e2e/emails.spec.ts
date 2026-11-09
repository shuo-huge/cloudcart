import { expect, test } from "@playwright/test";

test("admin can configure and toggle email notifications", async ({ page }) => {
  await page.goto("/admin/emails");
  await expect(page.getByRole("heading", { name: "Email notifications" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Disabled by default");

  await page.getByRole("button", { name: "Enable email notifications" }).click();
  await expect(page.locator(".toast").last()).toContainText("Email notifications enabled.");
  await expect(page.getByRole("button", { name: "Disable email notifications" })).toBeVisible();

  await page.locator('input[type="email"]').first().fill("store@example.com");
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.locator(".toast").last()).toContainText("Email settings saved.");

  await expect(page.locator("body")).toContainText("No emails queued yet.");

  await page.getByRole("button", { name: "Disable email notifications" }).click();
  await expect(page.locator(".toast").last()).toContainText("Email notifications disabled.");
  await expect(page.getByRole("button", { name: "Enable email notifications" })).toBeVisible();
});
