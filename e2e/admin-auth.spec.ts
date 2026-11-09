import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("owner can sign in to the admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await page.locator('input[name="email"]').fill("e2e-owner@example.com");
  await page.locator('input[name="password"]').fill("E2ePassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".sidebar-link").first()).toBeVisible();
  await expect(page.locator(".sidebar-link", { hasText: "Dashboard" })).toBeVisible();
  await expect(page.locator(".topbar-name")).toContainText("E2E Owner");
});
