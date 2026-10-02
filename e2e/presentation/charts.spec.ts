import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.setContent(readFileSync(".next/chart-fixture.html", "utf8"));
  await expect(page.getByTestId("complete").locator("svg").first()).toBeVisible();
});
test("authoritative values, grouping controls, negative bands, sparse and incomplete states", async ({ page }, info) => {
  const complete = page.getByTestId("complete");
  const trend = complete.getByRole("region", { name: "Value over time" });
  await expect(trend.locator(".headline-number")).toHaveText("$607.80");
  const composition = complete.getByRole("region", { name: "Composition over time" });
  await expect(composition.locator(".headline-number")).toHaveText("$747.80");
  for (const group of ["Investment", "Asset class", "Account type", "Tax status", "Liquidity", "Institution", "Owner set"]) {
    await composition.getByLabel("Group by").selectOption({ label: group });
    await expect(composition.locator(".headline-number")).toHaveText("$747.80");
  }
  await expect(composition.locator(".chart-segments")).toContainText("Owner A + Owner B");
  expect(await composition.getByLabel("Group by").locator("option").allTextContents()).not.toContain("Custom group");
  await expect(page.getByTestId("negative").locator(".headline-number").first()).toHaveText("−$20.00");
  await expect(page.getByTestId("negative")).toContainText("Hatched areas subtract negative NAV");
  const partial = page.getByTestId("partial").getByRole("region", { name: "Value over time" });
  await partial.getByLabel("Inspect recorded date").selectOption("2026-01-01");
  await expect(partial).toContainText("Incomplete valuation coverage");
  await expect(partial.locator(".headline-number")).toContainText("—");
  await expect(partial).toContainText("4 of 5 investments valued");
  await expect(page.getByTestId("sparse")).toContainText("Only one observation");
  await expect(page.getByTestId("empty")).toContainText("No valuation observations");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await trend.screenshot({ path: info.outputPath("trend.png") });
  await composition.screenshot({ path: info.outputPath("composition.png") });
});
test("range and keyboard selection synchronize exact value and date outside the plot", async ({ page }) => {
  const trend = page.getByTestId("complete").getByRole("region", { name: "Value over time" });
  await trend.getByRole("button", { name: "3M", exact: true }).click();
  expect(await trend.getByLabel("Inspect recorded date").locator("option").count()).toBe(2);
  await trend.getByRole("button", { name: "All", exact: true }).click();
  const control = trend.getByLabel("Inspect recorded date");
  await control.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(trend.locator(".as-of-date time")).toHaveAttribute("datetime", "2026-01-01");
  await expect(trend.locator(".headline-number")).toHaveText("$750.00");
  await trend.getByLabel("Measure").selectOption("debtCents");
  await expect(trend.locator(".headline-number")).toHaveText("$100.00");
  await trend.getByRole("button", { name: "3M", exact: true }).click();
  await expect(trend.locator(".as-of-date time")).toHaveAttribute("datetime", "2026-10-01");
});
test("desktop pointer selects nearest observation and retains crosshair on exit", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  for (const name of ["Value over time", "Composition over time"]) {
    const chart = page.getByTestId("complete").getByRole("region", { name });
    await chart.locator(".history-plot").scrollIntoViewIfNeeded();
    const box = (await chart.locator(".history-plot").boundingBox())!;
    await page.mouse.move(box.x + 56, box.y + 50);
    await expect(chart.locator(".as-of-date time")).toHaveAttribute("datetime", "2026-01-01");
    await page.mouse.move(box.x + box.width - 16, box.y + 50);
    await expect(chart.locator(".as-of-date time")).toHaveAttribute("datetime", "2026-10-01");
    await page.mouse.move(0, 0);
    await expect(chart.locator(".history-crosshair")).toBeVisible();
  }
});
test("phone horizontal touch selects dates and vertical gesture scrolls", async ({ page, context }, info) => {
  test.skip(info.project.name !== "iphone");
  const session = await context.newCDPSession(page);
  for (const name of ["Value over time", "Composition over time"]) {
    const chart = page.getByTestId("complete").getByRole("region", { name });
    await chart.locator(".history-plot").scrollIntoViewIfNeeded();
    await chart.locator(".history-plot").scrollIntoViewIfNeeded();
    const box = (await chart.locator(".history-plot").boundingBox())!;
    const x = box.x + 56, y = box.y + 120;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width - 16, y: y + 2 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(chart.locator(".as-of-date time")).toHaveAttribute("datetime", "2026-10-01");
  }
  const plot = page.getByTestId("complete").getByRole("region", { name: "Value over time" }).locator(".history-plot");
  await plot.scrollIntoViewIfNeeded();
  const box = (await plot.boundingBox())!;
  const before = await page.evaluate(() => window.scrollY);
  const x = box.x + box.width / 2, y = box.y + 200;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (const delta of [30, 60, 90, 120]) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 2, y: y - delta }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 20);
});

test("repeated composition colors retain distinct numbered plot and breakdown labels", async ({ page }) => {
  const chart = page.getByTestId("many");
  await chart.scrollIntoViewIfNeeded();
  const entries = chart.locator(".chart-segments dt");
  await expect(entries).toHaveCount(9);
  // First and ninth share a palette color, so color alone cannot identify them.
  const swatches = chart.locator(".chart-swatch");
  expect(await swatches.nth(0).evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe(await swatches.nth(8).evaluate((node) => getComputedStyle(node).backgroundColor));
  for (let index = 0; index < 9; index++) {
    await expect(entries.nth(index)).toHaveText((index + 1) + ". Example bucket " + (index + 1));
    await expect(chart.locator('svg text[text-anchor="start"]').filter({ hasText: new RegExp("^" + (index + 1) + "$") })).toBeVisible();
  }
});

test("a range fallback persists when the previously selected observation returns", async ({ page }) => {
  for (const name of ["Value over time", "Composition over time"]) {
    const chart = page.getByTestId("complete").getByRole("region", { name });
    const dates = chart.getByLabel("Inspect recorded date");
    await dates.selectOption("2026-01-01");
    await chart.getByRole("button", { name: "3M", exact: true }).click();
    await expect(dates).toHaveValue("2026-10-01");
    await chart.getByRole("button", { name: "All", exact: true }).click();
    await expect(dates).toHaveValue("2026-10-01");
    await expect(chart.locator(".as-of-date time")).toHaveAttribute("datetime", "2026-10-01");
    // A selection still inside the new range should remain selected.
    await dates.selectOption("2026-07-01");
    await chart.getByRole("button", { name: "1Y", exact: true }).click();
    await expect(dates).toHaveValue("2026-07-01");
  }
});

test("composition palette matches plotted areas/lines and remains stable across ranges", async ({ page }, info) => {
  for (const fixture of ["complete", "negative"]) {
    const chart = page.getByTestId(fixture).getByRole("region", { name: "Composition over time" });
    const swatches = chart.locator(".chart-swatch");
    const colors = await swatches.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
    expect(new Set(colors).size).toBe(colors.length);
    const strokes = await chart.locator("svg path").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).stroke));
    for (const color of colors) expect(strokes).toContain(color);
    if (fixture === "negative") {
      await expect(chart.locator("svg pattern").first()).toBeAttached();
      await expect(chart.locator(".chart-swatch[data-negative]")).toHaveCount(1);
    }
    if (fixture === "complete") {
      const fills = await chart.locator("svg path").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill));
      for (const color of colors) expect(fills).toContain(color);
    }
    await chart.getByRole("button", { name: "3M", exact: true }).click();
    expect(await swatches.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor))).toEqual(colors);
    await chart.getByRole("button", { name: "All", exact: true }).click();
    await chart.screenshot({ path: info.outputPath(fixture + "-palette.png") });
  }
});

test("signed areas hatch only negative dates and retain the authoritative total", async ({ page }, info) => {
  const chart = page.getByTestId("signed");
  const dates = chart.getByLabel("Inspect recorded date");
  await expect(chart.locator(".headline-number")).toHaveText("$250.00");
  await expect(chart.locator(".chart-swatch[data-negative]")).toHaveCount(1);
  await expect(chart.locator('svg path[fill^="url("]').first()).toBeVisible();
  await dates.selectOption("2026-07-01");
  await expect(chart.locator(".headline-number")).toHaveText("$320.00");
  await expect(chart.locator(".chart-swatch[data-negative]")).toHaveCount(0);
  await dates.selectOption("2026-01-01");
  await expect(chart.locator(".headline-number")).toHaveText("$240.00");
  await expect(chart.locator(".chart-segments")).toContainText("−$60.00");
  await chart.screenshot({ path: info.outputPath("signed-bands.png") });
});
