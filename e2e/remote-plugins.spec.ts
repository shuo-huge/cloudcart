import { expect, test } from "@playwright/test";

const MANIFEST_URL = "http://127.0.0.1:8788/cloudcart-plugin.json";
const PLUGIN_SECRET = "e2e-remote-plugin-secret-123456";
const PLUGIN_ORIGIN = "http://127.0.0.1:8788";

test("installs, opens, disables, and uninstalls a remote plugin", async ({ page }) => {
  await page.goto("/admin/plugins");
  await expect(page.getByRole("heading", { name: "Plugins" })).toBeVisible();

  await page.getByRole("button", { name: "Install remote plugin" }).click();
  await page.getByLabel("Manifest URL").fill(MANIFEST_URL);
  await page.getByRole("button", { name: "Preview", exact: true }).click();

  await expect(page.getByRole("heading", { name: "E2E Remote Plugin" })).toBeVisible();
  await expect(page.locator(".remote-preview")).toContainText("store:read");
  await expect(page.locator(".remote-preview")).toContainText("Plugin Dashboard");

  await page.getByLabel("Service secret (optional)").fill(PLUGIN_SECRET);
  await page.getByRole("button", { name: "Install plugin" }).click();

  await expect(page.locator("tr").filter({ hasText: "E2E Remote Plugin" }).first()).toBeVisible();
  const row = page.locator("tr").filter({ hasText: "E2E Remote Plugin" }).first();
  await expect(row).toContainText("remote");

  await row.getByRole("button", { name: "Enable" }).click();
  const pluginMenu = page.locator(".sidebar-link--plugin", { hasText: "Plugin Dashboard" });
  await expect(pluginMenu).toBeVisible();

  const adminResponse = await page.reload();
  expect(adminResponse).not.toBeNull();
  const csp = adminResponse!.headers()["content-security-policy"];
  expect(csp).toContain(`frame-src 'self'`);
  expect(csp).toContain(PLUGIN_ORIGIN);
  expect(csp).not.toContain("frame-src https:");

  await pluginMenu.click();
  await expect(page).toHaveURL(/\/admin\/plugins\/e2e-remote-plugin\/dashboard/);
  expect(page.url()).not.toContain("token=");

  const frame = page.frameLocator("iframe.remote-plugin-frame");
  await expect(frame.locator("[data-plugin-page]")).toHaveText("dashboard");
  await expect(frame.locator("[data-plugin-store-name]")).toHaveText("E2E Store");
  await expect(frame.locator("[data-plugin-store-id]")).toContainText("store_");
  await expect(frame.locator("[data-plugin-token-status]")).toHaveText("received");

  await page.goto("/admin/plugins");
  const enabledRow = page.locator("tr").filter({ hasText: "E2E Remote Plugin" }).first();
  await enabledRow.getByRole("button", { name: "Disable" }).click();
  await expect(page.locator(".sidebar-link--plugin", { hasText: "Plugin Dashboard" })).toBeHidden();

  page.once("dialog", (dialog) => void dialog.accept());
  const disabledRow = page.locator("tr").filter({ hasText: "E2E Remote Plugin" }).first();
  await disabledRow.getByRole("button", { name: "Uninstall" }).click();
  await expect(page.locator("tr").filter({ hasText: "E2E Remote Plugin" })).toHaveCount(0);
});
