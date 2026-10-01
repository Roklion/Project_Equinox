import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Render the real components through tsx in global setup, then inspect the same
// markup and production CSS in a browser without a database or a test-only route.
test.beforeEach(async ({ page }) => {
  await page.setContent(readFileSync(".next/presentation-fixture.html", "utf8"));
});
test("keyboard navigation has visible focus, usable targets, and all destinations", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  for (const name of ["Overview", "Investments", "Update Center", "Add entry"]) {
    await page.keyboard.press("Tab");
    const link = page.getByRole("navigation").getByRole("link", { name, exact: true });
    await expect(link).toBeFocused();
    expect(await link.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeFocused();
  await expect(page.locator('[aria-current="page"]')).toHaveText("Investments");
});

test("financial values, unavailable reasons, old marks and dates fit both layouts", async ({ page }, testInfo) => {
  await expect(page.getByText("−$50.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Unavailable: The dated cash flows/)).toBeVisible();
  await expect(page.getByText(/Older valuation · 30 days old/)).toBeVisible();
  for (const date of await page.locator('.as-of-date time').all()) await expect(date).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const columns = await page.locator('.investment-row').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(testInfo.project.name === "iphone" ? 1 : 2);
  await page.screenshot({ path: testInfo.outputPath("presentation.png"), fullPage: true });
});
