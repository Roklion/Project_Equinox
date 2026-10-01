import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("browse and detail preserve value states, lifecycle and correction navigation", async ({ page }, testInfo) => {
  await signIn(page);
  const origin = new URL(page.url()).origin;
  const headers = { origin };
  const { choices } = await (await page.request.get("/api/investments")).json();
  async function create(suffix: string) {
    const response = await page.request.post("/api/investments", { headers, data: {
      operation: "create", name: "Synthetic browse " + testInfo.project.name + " " + suffix,
      ownerIds: [choices.owners[0].id], groupIds: [], assetClassId: choices.assetClasses[0].id,
    } });
    expect(response.status()).toBe(200);
    return (await response.json()).id as string;
  }
  const funded = await create("funded");
  const negative = await create("negative");
  const missing = await create("unvalued");
  async function entry(data: Record<string, string>) {
    const response = await page.request.post("/api/entries", { headers, data });
    expect(response.status()).toBe(200);
  }
  await entry({ kind: "contribution", investmentId: funded, date: "2024-01-01", amount: "100" });
  await entry({ kind: "valuation", operation: "create", investmentId: funded, date: "2026-01-01", grossValue: "121", debt: "0" });
  await entry({ kind: "valuation", operation: "create", investmentId: negative, date: "2026-01-01", grossValue: "10", debt: "30" });
  await page.goto("/investments?date=2026-02-01");
  const row = (id: string) => page.locator(".investment-row").filter({ has: page.locator('a[href^="/investments/' + id + '?"]') });
  await expect(row(funded).getByText("$121.00", { exact: true })).toBeVisible();
  await expect(row(negative).getByText("−$20.00", { exact: true })).toBeVisible();
  await expect(row(missing).getByText(/Valuation coverage is incomplete/)).toBeVisible();
  await expect(row(missing).getByText("$0.00", { exact: true })).toHaveCount(0);
  await expect(row(funded).getByText(/31 days old/)).toBeVisible();
  await expect(row(funded).locator('time[datetime="2026-02-01"]')).toBeVisible();
  await page.getByText("Filter by classification and ownership", { exact: true }).click();
  await page.getByLabel("Owner", { exact: true }).selectOption(choices.owners[0].id);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(row(funded)).toBeVisible();
  await page.getByLabel("Reporting date").focus();
  expect(await page.getByLabel("Reporting date").evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect((await page.getByRole("button", { name: "Apply filters" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("investments.png"), fullPage: true });
  await page.goto("/investments/" + funded + "?date=2026-02-01&start=2024-01-01");
  await expect(page.getByLabel("Period start")).toHaveValue("2024-01-01");
  const trend = page.getByRole("region", { name: "Value over time" });
  await expect(trend.locator("svg")).toBeVisible();
  await expect(trend.getByLabel("Inspect recorded date")).toHaveValue("2026-01-01");
  await page.getByLabel("Reporting date").fill("2025-12-31");
  await page.getByRole("button", { name: "Update period" }).click();
  await expect(page.getByRole("region", { name: "Value over time" }).getByText("No valuation observations in this range.")).toBeVisible();
  await expect(page.getByLabel("Reporting date")).toHaveValue("2025-12-31");
  await page.getByLabel("Reporting date").fill("2026-02-01");
  await page.getByRole("button", { name: "Update period" }).click();
  await expect(page.getByText("1.21×", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Period performance" })).toBeVisible();
  await page.getByText("Ownership and classification", { exact: true }).click();
  await expect(page.getByRole("definition").filter({ hasText: choices.owners[0].label })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("investment-detail.png"), fullPage: true });
  await page.getByRole("link", { name: "View history and corrections", exact: true }).click();
  await expect(page.getByLabel("Investment", { exact: true })).toHaveValue(funded);
  await page.getByRole("button", { name: "Edit or delete", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Save correction" })).toBeVisible();
  await page.goto("/investments/" + negative + "?date=2026-02-01");
  await expect(page.getByText(/No contributions are recorded/)).toBeVisible();
  await expect(page.getByText(/The dated cash flows do not support/)).toBeVisible();
  await page.goto("/investments/" + missing + "?date=2026-02-01");
  await expect(page.getByText(/Valuation coverage is incomplete/).first()).toBeVisible();
  expect((await page.request.post("/api/investments", { headers, data: {
    operation: "close", investmentId: funded, closedOn: "2026-01-01", confirmed: true,
  } })).status()).toBe(200);
  await page.goto("/investments?date=2026-02-01");
  await expect(row(funded)).toHaveCount(0);
  await page.getByLabel("Investments to show").selectOption("closed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(row(funded)).toBeVisible();
  await row(funded).getByRole("link").click();
  await expect(page.getByLabel("Reporting date")).toHaveValue("2026-02-01");
  await expect(page.getByText("Closed on Jan 1, 2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add financial action" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage investment" })).toBeVisible();
  await page.getByRole("link", { name: "Open action and valuation history" }).click();
  await expect(page.getByLabel("Investment", { exact: true })).toHaveValue(funded);
});
