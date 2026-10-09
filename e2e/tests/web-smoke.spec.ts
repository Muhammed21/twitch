import { expect, test } from "@playwright/test";

test("the web home page loads without a page error", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("an unknown path answers 404", async ({ page }) => {
  const response = await page.goto("/cette-page-n-existe-pas");

  expect(response?.status()).toBe(404);
});
