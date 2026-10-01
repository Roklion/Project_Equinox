import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("shell navigation integrates investment detail, history, Update Center and Add", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await signIn(page);
  await page.keyboard.press("Tab");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Investments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investments", exact: true })).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Investments");
  await page.getByRole("link", { name: "Sample Market Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sample Market Account", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View history and corrections" }).click();
  await expect(page.getByLabel("Investment", { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel("Investment", { exact: true }).locator('option:checked')).toHaveText("Sample Market Account");
  await nav.getByRole("link", { name: "Update Center" }).click();
  await expect(page.getByRole("heading", { name: "Update Center", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Batch valuation update/ }).click();
  await expect(page.getByLabel("Shared as-of date")).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Update Center");
  await nav.getByRole("link", { name: "Add entry" }).click();
  await expect(page.getByRole("link", { name: /Contribution/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
