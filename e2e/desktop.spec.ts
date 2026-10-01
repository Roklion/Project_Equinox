import { expect, test } from "@playwright/test";
import { batchRow, historyItem, openHistory, signIn } from "./helpers";

test.beforeEach(async ({ page }) => { await signIn(page); });

test("external flows and one linked transfer can be corrected and deleted", async ({ page }) => {
  for (const [kind, date, label, amount] of [
    ["contribution", "2026-01-10", "Amount contributed", "123.45"],
    ["withdrawal", "2026-01-11", "Amount withdrawn", "23.45"],
  ] as const) {
    await page.goto(`/add/${kind}`);
    await page.getByLabel("Effective date").fill(date);
    await page.getByLabel("Investment", { exact: true }).selectOption({ label: "Sample Market Account" });
    await page.getByLabel(label).fill(amount);
    await page.getByRole("button", { name: `Save ${kind}` }).click();
    await expect(page.getByText(new RegExp(`${kind} saved`, "i"))).toBeVisible();
  }
  await page.goto("/add/transfer");
  await page.getByLabel("Effective date").fill("2026-01-12");
  await page.getByLabel("Move value from").selectOption({ label: "Sample Market Account" });
  await page.getByLabel("Move value to").selectOption({ label: "Sample Retirement Account" });
  await page.getByLabel("Amount to move").fill("45.67");
  await page.getByRole("button", { name: "Save transfer" }).click();
  await expect(page.getByText("Transfer saved", { exact: false })).toBeVisible();

  await openHistory(page, "Sample Market Account");
  const contribution = historyItem(page, "Contribution", "2026-01-10");
  await expect(contribution).toContainText("$123.45");
  await contribution.getByRole("button", { name: "Edit or delete" }).click();
  await page.getByLabel("Positive amount").fill("125.45");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(historyItem(page, "Contribution", "2026-01-10")).toContainText("$125.45");

  const withdrawal = historyItem(page, "Withdrawal / distribution", "2026-01-11");
  await withdrawal.getByRole("button", { name: "Edit or delete" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(withdrawal).toHaveCount(0);

  const transferOut = historyItem(page, "Transfer out", "2026-01-12");
  await expect(transferOut).toContainText("To Sample Retirement Account");
  await expect(transferOut).toContainText("$45.67");
  await openHistory(page, "Sample Retirement Account");
  const transferIn = historyItem(page, "Transfer in", "2026-01-12");
  await expect(transferIn).toContainText("From Sample Market Account");
  await expect(transferIn).toContainText("$45.67");
  await transferIn.getByRole("button", { name: "Edit or delete" }).click();
  await expect(page.getByRole("heading", { name: "Whole transfer" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(transferIn).toHaveCount(0);
  await openHistory(page, "Sample Market Account");
  await expect(historyItem(page, "Transfer out", "2026-01-12")).toHaveCount(0);
});

test("negative net value remains a mark and same-date correction is explicit", async ({ page }) => {
  await page.goto("/add/valuation");
  await page.getByLabel("As-of date").fill("2026-02-10");
  await page.getByLabel("Investment", { exact: true }).selectOption({ label: "Sample Property Investment" });
  await page.getByLabel("Gross investment value").fill("100.00");
  await page.getByLabel("Investment-linked debt").fill("150.00");
  await expect(page.getByLabel("Valuation preview")).toContainText("−$50.00");
  await page.getByRole("button", { name: "Save valuation mark" }).click();
  await expect(page.getByText("Valuation saved", { exact: true })).toBeVisible();
  await openHistory(page, "Sample Property Investment");
  await expect(historyItem(page, "Valuation mark", "2026-02-10")).toContainText("−$50.00");
  await expect(historyItem(page, "Contribution", "2026-02-10")).toHaveCount(0);

  await page.goto("/add/valuation");
  await page.getByLabel("As-of date").fill("2026-02-10");
  await page.getByLabel("Investment", { exact: true }).selectOption({ label: "Sample Property Investment" });
  await expect(page.getByText("Existing mark on 2026-02-10")).toBeVisible();
  await page.getByLabel("Gross investment value").fill("120.00");
  await expect(page.getByLabel("Valuation preview")).toContainText("−$30.00");
  await page.getByRole("button", { name: "Correct existing mark" }).click();
  await expect(page.getByText("Valuation corrected", { exact: true })).toBeVisible();
  await openHistory(page, "Sample Property Investment");
  const mark = historyItem(page, "Valuation mark", "2026-02-10");
  await expect(mark).toContainText("−$30.00");
  await expect(mark).toContainText("Debt $150.00");
  await mark.getByRole("button", { name: "Edit or delete" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(mark).toHaveCount(0);
});

test("batch failure is atomic, keeps inputs, and requires explicit replacement", async ({ page }) => {
  await page.goto("/valuations/batch");
  await page.getByLabel("Shared as-of date").fill("2026-04-11");
  const market = batchRow(page, "Sample Market Account");
  const retirement = batchRow(page, "Sample Retirement Account");
  await market.getByLabel("Gross value").fill("1000.00");
  await retirement.getByLabel("Gross value").fill("800.00");
  await retirement.getByLabel("Linked debt").fill("invalid");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(page.getByText("No marks were saved.", { exact: false })).toBeVisible();
  await expect(market.getByLabel("Gross value")).toHaveValue("1000.00");
  await expect(retirement.getByLabel("Linked debt")).toHaveValue("invalid");
  await openHistory(page, "Sample Market Account");
  await expect(historyItem(page, "Valuation mark", "2026-04-11")).toHaveCount(0);

  await page.goto("/valuations/batch");
  await page.getByLabel("Shared as-of date").fill("2026-04-11");
  await batchRow(page, "Sample Market Account").getByLabel("Gross value").fill("1000.00");
  await batchRow(page, "Sample Retirement Account").getByLabel("Gross value").fill("800.00");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(page.getByText("2 valuation marks saved for 2026-04-11.")).toBeVisible();
  await openHistory(page, "Sample Market Account");
  await expect(historyItem(page, "Valuation mark", "2026-04-11")).toContainText("$1,000.00");
  await openHistory(page, "Sample Retirement Account");
  await expect(historyItem(page, "Valuation mark", "2026-04-11")).toContainText("$800.00");

  await page.goto("/valuations/batch");
  await page.getByLabel("Shared as-of date").fill("2026-04-11");
  const existing = batchRow(page, "Sample Market Account");
  await expect(existing).toContainText("Mark exists on 2026-04-11");
  await existing.getByLabel("Gross value").fill("1100.00");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(existing.getByText("Choose correction explicitly for the existing mark.")).toBeVisible();
  await expect(existing.getByLabel("Gross value")).toHaveValue("1100.00");
  await existing.getByLabel("Save as").selectOption("replace");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(page.getByText("1 valuation mark saved for 2026-04-11.")).toBeVisible();
  await openHistory(page, "Sample Market Account");
  await expect(historyItem(page, "Valuation mark", "2026-04-11")).toContainText("$1,100.00");
});

test("a late batch conflict refreshes retained debt before correction", async ({ page, context }) => {
  await page.goto("/valuations/batch");
  await page.getByLabel("Shared as-of date").fill("2026-04-12");
  const market = batchRow(page, "Sample Market Account");
  await market.getByLabel("Gross value").fill("1100.00");
  await expect(page.getByText("Loading investments and marks…")).toBeHidden();

  const otherTab = await context.newPage();
  await otherTab.goto("/add/valuation");
  await otherTab.getByLabel("As-of date").fill("2026-04-12");
  await otherTab.getByLabel("Investment", { exact: true }).selectOption({ label: "Sample Market Account" });
  await otherTab.getByLabel("Gross investment value").fill("1000.00");
  await otherTab.getByLabel("Investment-linked debt").fill("250.00");
  await otherTab.getByRole("button", { name: "Save valuation mark" }).click();
  await expect(otherTab.getByText("Valuation saved", { exact: true })).toBeVisible();
  await otherTab.close();

  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(market).toContainText("Mark exists on 2026-04-12");
  await expect(market.getByLabel("Gross value")).toHaveValue("1100.00");
  await expect(market.getByLabel("Linked debt")).toHaveValue("");
  await expect(market.getByLabel("Linked debt")).toHaveAttribute("placeholder", "Keep 250.00");
  await expect(market.getByLabel("Save as")).toHaveAttribute("aria-invalid", "true");
  await expect(market.getByLabel("Gross value")).toHaveAttribute("aria-invalid", "false");
  await market.getByLabel("Save as").selectOption("replace");
  await expect(market.locator(".batch-net")).toContainText("$850.00");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(page.getByText("1 valuation mark saved for 2026-04-12.")).toBeVisible();
  await openHistory(page, "Sample Market Account");
  const mark = historyItem(page, "Valuation mark", "2026-04-12");
  await expect(mark).toContainText("$850.00");
  await expect(mark).toContainText("Debt $250.00");
});
