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

test("unavailable and ambiguous returns retain explanations without false zero values", async ({ page }) => {
  await expect(page.getByText(/Unavailable: The dated cash flows/)).toBeVisible();
  await expect(page.getByText(/Multiple candidate returns need review/)).toBeVisible();
  await expect(page.getByText("0.00%", { exact: true })).toHaveCount(0);
  await expect(page.getByText("0.00×", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("all browse dimensions stay discoverable with usable controls and preserved URL context", async ({ page }, testInfo) => {
  const filters = page.locator(".investment-filters");
  for (const label of ["Asset class", "Account type", "Tax status", "Liquidity", "Institution", "Owner", "Custom group"]) {
    const select = filters.getByLabel(label, { exact: true });
    await expect(select).toBeVisible();
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await select.focus();
    expect(await select.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  }
  await expect(filters.getByLabel("Account type")).toHaveValue("accountType-id");
  await expect(filters.getByLabel("Tax status")).toHaveValue("taxStatus-id");
  await expect(filters.getByLabel("Liquidity")).toHaveValue("liquidity-id");
  const values = await filters.evaluate((element) => Object.fromEntries(new FormData(element as HTMLFormElement)));
  expect(values).toMatchObject({ date: "2026-10-01", lifecycle: "all", accountType: "accountType-id", taxStatus: "taxStatus-id", liquidity: "liquidity-id" });
  await expect(filters.getByRole("link", { name: "Reset filters" })).toHaveAttribute("href", "/investments?date=2026-10-01&lifecycle=all");
  const columns = await page.locator(".investment-filter-options").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(testInfo.project.name === "iphone" ? 1 : 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("browse-filters.png"), fullPage: true });
});
