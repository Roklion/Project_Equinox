import { expect, test } from "@playwright/test";
import { historyItem, openHistory, signIn } from "./helpers";
test("authenticated charts use persisted household and investment series", async ({ page }) => {
  await signIn(page);
  const trend = page.getByRole("region", { name: "Value over time" });
  const composition = page.getByRole("region", { name: "Composition over time" });
  await expect(trend.locator("svg")).toBeVisible();
  await trend.getByLabel("Inspect recorded date").selectOption("2025-06-30");
  await composition.getByLabel("Inspect recorded date").selectOption("2025-06-30");
  await expect(trend.locator(".headline-number")).toHaveText("$20,250.00");
  await expect(composition.locator(".headline-number")).toHaveText("$20,250.00");
  await trend.getByLabel("Inspect recorded date").selectOption("2025-03-31");
  await expect(trend.locator(".headline-number")).toHaveText("$18,700.00");
  await composition.getByLabel("Group by").selectOption("ownerSet");
  await expect(composition.locator(".chart-segments")).toContainText(/Owner A \+ Owner B|Owner B \+ Owner A/);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Investments", exact: true }).click();
  await page.getByRole("link", { name: "Sample Market Account", exact: true }).click();
  await page.getByRole("region", { name: "Value over time" }).getByLabel("Inspect recorded date").selectOption("2025-06-30");
  await expect(page.getByRole("region", { name: "Value over time" }).locator(".headline-number")).toHaveText("$9,400.00");
  await expect(page.getByRole("region", { name: "Composition over time" }).locator(".chart-segments")).toContainText("Sample Market Account");
});

test.describe("browser-local reporting date", () => {
  test.use({ timezoneId: "Asia/Tokyo" });
  test("includes a local-today mark before UTC midnight on overview and detail", async ({ page, context }) => {
    // The browser is on the following calendar day; the server remains on its own clock.
    await page.clock.setFixedTime(new Date("2027-01-01T16:00:00Z"));
    await signIn(page);
    await page.goto("/add/valuation");
    await expect(page.getByLabel("As-of date")).toHaveValue("2027-01-02");
    await page.getByLabel("Investment", { exact: true }).selectOption({ label: "Sample Market Account" });
    await page.getByLabel("Gross investment value").fill("12345.67");
    await page.getByRole("button", { name: "Save valuation mark" }).click();
    await expect(page.getByText("Valuation saved", { exact: true })).toBeVisible();
    // Exercise recovery from a valid but stale reporting-date cookie as well.
    await context.addCookies([{ name: "equinox-chart-date", value: "2027-01-01", url: page.url() }]);
    await page.goto("/");
    for (const name of ["Value over time", "Composition over time"]) {
      const chart = page.getByRole("region", { name });
      await expect(chart.getByLabel("Inspect recorded date")).toHaveValue("2027-01-02");
      await chart.getByRole("button", { name: "3M", exact: true }).click();
      await expect(chart.getByLabel("Inspect recorded date")).toHaveValue("2027-01-02");
    }
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Investments", exact: true }).click();
    await page.getByRole("link", { name: "Sample Market Account", exact: true }).click();
    for (const name of ["Value over time", "Composition over time"]) {
      const chart = page.getByRole("region", { name });
      await expect(chart.getByLabel("Inspect recorded date")).toHaveValue("2027-01-02");
      await expect(chart.locator(".headline-number")).toHaveText("$12,345.67");
    }
    await openHistory(page, "Sample Market Account");
    await historyItem(page, "Valuation mark", "2027-01-02").getByRole("button", { name: "Edit or delete" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete entry" }).click();
    await expect(historyItem(page, "Valuation mark", "2027-01-02")).toHaveCount(0);
  });
});
