import { expect, test } from "@playwright/test";
import { loadFixtures } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("guest checkout applies tax and shows the order confirmation", async ({ page }) => {
  const fixtures = loadFixtures();

  await page.goto(`/products/${fixtures.productSlug}`);
  await page.locator("[data-add-to-cart]:not([data-sticky-add-to-cart])").click();
  await expect(page.locator(".cc-cart-count").first()).toHaveText("1");

  await page.goto("/cart");
  await expect(page.locator("body")).toContainText("Calculated at checkout");

  await page.goto("/checkout");
  await page.locator('input[name="email"]').fill("e2e-buyer@example.com");
  await page.locator('input[name="name"]').fill("E2E Buyer");
  await page.locator('input[name="line1"]').fill("1 Market Street");
  await page.locator('input[name="city"]').fill("San Francisco");
  await page.locator('input[name="state"]').fill("CA");
  await page.locator('input[name="postalCode"]').fill("94105");
  await expect(page.locator('select[name="country"]')).toHaveValue("US");
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/orders\//);
  await expect(page.locator("body")).toContainText("Thank you");
  await expect(page.locator("body")).toContainText("Sales tax");
  await expect(page.locator("body")).toContainText("$2.48");
  await expect(page.locator("body")).toContainText("$32.48");
});
