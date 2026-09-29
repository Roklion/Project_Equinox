import { expect, test, type Page } from "@playwright/test";
import { batchRow, historyItem, openHistory, signIn } from "./helpers";

async function expectNarrowLayoutToFitViewport(page: Page) {
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const surfaces = [
      { name: "document", element: document.documentElement },
      { name: "body", element: document.body },
      ...Array.from(document.querySelectorAll<HTMLElement>("main, .batch-row, .history-item"))
        .map((element) => ({
          name: element.tagName.toLowerCase() + "." + String(element.className).trim().replace(/\s+/g, "."),
          element,
        })),
    ];

    return surfaces.flatMap(({ name, element }) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left < 0 || bounds.right > viewportWidth || element.scrollWidth > element.clientWidth
        ? [name + " overflows: " + element.scrollWidth + "px content in " + element.clientWidth + "px"]
        : [];
    });
  });
  expect(overflow).toEqual([]);
}

test("narrow entry, batch, and history controls remain usable", async ({ page }) => {
  await signIn(page);
  await expectNarrowLayoutToFitViewport(page);
  await page.getByRole("link", { name: /Add entry/ }).click();
  await expect(page.getByRole("navigation", { name: "Choose an action" })).toBeVisible();
  await expectNarrowLayoutToFitViewport(page);
  await page.getByRole("link", { name: /Contribution/ }).click();
  await expect(page.getByLabel("Investment", { exact: true })).toBeVisible();
  await expectNarrowLayoutToFitViewport(page);
  await page.getByLabel("Effective date").fill("2026-05-14");
  await page.getByLabel("Investment", { exact: true }).selectOption({ label: "Sample Insurance Policy" });
  await page.getByLabel("Amount contributed").fill("7.89");
  await page.getByRole("button", { name: "Save contribution" }).click();
  await expect(page.getByText("Contribution saved", { exact: false })).toBeVisible();
  await expectNarrowLayoutToFitViewport(page);

  await page.goto("/valuations/batch");
  await page.getByLabel("Shared as-of date").fill("2026-05-15");
  const policy = batchRow(page, "Sample Insurance Policy");
  await expect(policy.getByLabel("Gross value")).toBeVisible();
  await expectNarrowLayoutToFitViewport(page);
  await policy.getByLabel("Gross value").fill("6.00");
  await policy.getByLabel("Linked debt").fill("10.00");
  await expect(policy).toContainText("−$4.00");
  await page.getByRole("button", { name: "Save entered marks" }).click();
  await expect(page.getByText("1 valuation mark saved for 2026-05-15.")).toBeVisible();
  await expectNarrowLayoutToFitViewport(page);
  await openHistory(page, "Sample Insurance Policy");
  await expect(historyItem(page, "Contribution", "2026-05-14")).toContainText("$7.89");
  await expect(historyItem(page, "Valuation mark", "2026-05-15")).toContainText("−$4.00");
  await expectNarrowLayoutToFitViewport(page);
});
