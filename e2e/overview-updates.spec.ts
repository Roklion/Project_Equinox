import { expect, test } from "@playwright/test";
import { batchRow, signIn } from "./helpers";

test("Overview and Update Center integrate maintenance and fresh single/batch save returns", async ({ page }, testInfo) => {
  await signIn(page);
  const headers = { origin: new URL(page.url()).origin };
  const { choices } = await (await page.request.get("/api/investments")).json();
  const prefix = "Synthetic maintenance " + testInfo.project.name;
  async function create(suffix: string) {
    const response = await page.request.post("/api/investments", { headers, data: {
      operation: "create", name: prefix + " " + suffix, ownerIds: [choices.owners[0].id], groupIds: [],
    } });
    expect(response.status()).toBe(200);
    return (await response.json()).id as string;
  }
  async function mark(investmentId: string, date: string, grossValue: string, debt = "0") {
    const response = await page.request.post("/api/entries", { headers, data: {
      kind: "valuation", operation: "create", investmentId, date, grossValue, debt,
    } });
    expect(response.status()).toBe(200);
  }
  const missing = await create("missing");
  const stale = await create("stale");
  const current = await create("current");
  const closed = await create("closed");
  await mark(stale, "2026-01-01", "100");
  await mark(current, "2026-10-01", "10", "30");
  await mark(closed, "2026-01-01", "0");
  expect((await page.request.post("/api/investments", { headers, data: {
    operation: "close", investmentId: closed, closedOn: "2026-01-01", confirmed: true,
  } })).status()).toBe(200);
  await page.goto("/?date=2026-10-01&range=1y");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.locator(".page-heading .headline-number").getByText(/Valuation coverage is incomplete/)).toBeVisible();
  await page.getByText("Actual valuation dates and coverage", { exact: true }).click();
  await expect(page.getByText("Missing qualifying valuation").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Value over time" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Composition over time" })).toBeVisible();
  const headline = (await page.locator(".page-heading .headline-value").boundingBox())!;
  const chart = (await page.getByRole("region", { name: "Value over time" }).boundingBox())!;
  const performance = (await page.locator(".overview-period").boundingBox())!;
  expect(headline.y).toBeLessThan(chart.y);
  if (testInfo.project.name === "iphone") expect(chart.y).toBeLessThan(performance.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("overview.png"), fullPage: true });

  await page.getByRole("link", { name: "Update valuations", exact: true }).click();
  const maintenance = page.locator('[aria-labelledby="maintenance-heading"]');
  const row = (name: string) => maintenance.locator(".maintenance-item").filter({ has: page.getByRole("heading", { name: prefix + " " + name, exact: true }) });
  await expect(row("missing").getByText("Missing valuation", { exact: true })).toBeVisible();
  await expect(row("stale").getByText("Stale valuation", { exact: true })).toBeVisible();
  await expect(row("current").getByText("Recent valuation", { exact: true })).toBeVisible();
  await expect(row("current").getByText("−$20.00", { exact: true })).toBeVisible();
  await expect(row("closed")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await row("missing").getByRole("link", { name: "Update valuation", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath("update-center.png"), fullPage: true });
  const documentTimeOrigin = await page.evaluate(() => window.performance.timeOrigin);
  await row("missing").getByRole("link", { name: "Update valuation", exact: true }).click();
  await expect(page.getByLabel("Investment", { exact: true })).toHaveValue(missing);
  await expect(page.getByLabel("As-of date", { exact: true })).toHaveValue("2026-10-01");
  await expect(page.getByText("Checking investments and date…")).toBeHidden();
  await page.getByLabel("Gross investment value", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Save valuation mark" }).click();
  await expect(page.getByLabel("Gross investment value", { exact: true })).toHaveValue("invalid");
  await expect(page.getByText("Checking investments and date…")).toBeHidden();
  await page.getByLabel("Gross investment value", { exact: true }).fill("123.45");
  await page.getByRole("button", { name: "Save valuation mark" }).click();
  await expect(page.getByRole("heading", { name: "Valuation saved", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Return to Update Center", exact: true }).click();
  await expect(page.getByLabel("Reporting date", { exact: true })).toHaveValue("2026-10-01");
  await expect(row("missing").getByText("Recent valuation", { exact: true })).toBeVisible();
  await expect(row("missing").getByText("$123.45", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Batch valuation update/ }).click();
  await expect(page.getByLabel("Shared as-of date")).toHaveValue("2026-10-01");
  await expect(page.getByText("Loading investments and marks…")).toBeHidden();
  await batchRow(page, prefix + " stale").getByLabel("Gross value", { exact: true }).fill("215");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(page.getByText("1 valuation mark saved for 2026-10-01.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Return to Update Center", exact: true }).click();
  await expect(row("stale").getByText("Recent valuation", { exact: true })).toBeVisible();
  await expect(row("stale").getByText("$215.00", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.performance.timeOrigin)).toBe(documentTimeOrigin);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Add entry" }).click();
  await expect(page.locator(".action-grid .action-choice")).toHaveCount(4);
  await expect(page.getByRole("link", { name: /Contribution/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Withdrawal/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Transfer/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Valuation Mark/ })).toBeVisible();
});

test("reporting today follows the browser calendar and range controls preserve it", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-10-01T23:30:00Z") });
  await signIn(page);
  await expect(page.getByLabel("Reporting date", { exact: true })).toHaveValue("2026-10-02");
  await page.getByLabel("Performance period", { exact: true }).selectOption("3m");
  await page.getByRole("button", { name: "Update overview", exact: true }).click();
  await expect(page.getByLabel("Reporting date", { exact: true })).toHaveValue("2026-10-02");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Update Center", exact: true }).click();
  await expect(page.getByLabel("Reporting date", { exact: true })).toHaveValue("2026-10-02");
  await context.close();
});
