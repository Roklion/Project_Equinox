import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

async function fitsViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const name = page.getByLabel("Display name");
  await name.focus();
  await expect(name).toBeFocused();
  expect(await name.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}

test("create, edit, and close an investment while preserving history", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/investments");
  await page.getByRole("link", { name: "Add investment", exact: true }).click();
  const name = `Synthetic lifecycle ${testInfo.project.name}`;
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Create investment" }).click();
  await expect(page.getByText("Choose at least one owner.")).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue(name);
  await page.getByLabel("Owner A", { exact: true }).check();
  await page.getByLabel("Owner B", { exact: true }).check();
  await page.getByLabel("Asset class", { exact: true }).selectOption({ label: "Public markets" });
  await page.getByLabel("Account type", { exact: true }).selectOption({ label: "Brokerage" });
  await page.getByLabel("Tax status", { exact: true }).selectOption({ label: "Taxable" });
  await page.getByLabel("Liquidity", { exact: true }).selectOption({ label: "Liquid" });
  await page.getByLabel("Institution", { exact: true }).selectOption({ label: "Example Provider" });
  await page.getByLabel("Long term examples").check();
  await fitsViewport(page);
  // Hold the response so the test can observe disabled controls and one request.
  let requests = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/investments", async (route) => {
    if (route.request().method() === "POST") { requests++; await released; }
    await route.continue();
  });
  await page.getByRole("button", { name: "Create investment" }).click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.getByLabel("Display name")).toBeDisabled();
  release();
  await expect(page.getByRole("heading", { name: "Investment created" })).toBeVisible();
  expect(requests).toBe(1);
  await page.unroute("**/api/investments");
  await page.getByRole("link", { name: "View investment", exact: true }).click();
  await expect(page).toHaveURL(/\/investments\/[\da-f-]{36}$/);
  const investmentId = new URL(page.url()).pathname.split("/").at(-1)!;
  const readHistory = async () => (await page.request.get(`/api/history?investmentId=${investmentId}`)).json();
  const empty = await readHistory();
  expect(empty.history).toEqual({ movements: [], marks: [] });
  const origin = new URL(page.url()).origin;
  for (const entry of [
    { kind: "contribution", amount: "10" },
    { kind: "valuation", operation: "create", grossValue: "20", debt: "30" },
  ]) {
    expect((await page.request.post("/api/entries", { headers: { origin }, data: { ...entry, investmentId, date: "2026-02-02" } })).status()).toBe(200);
  }
  const before = (await readHistory()).history;
  await page.getByRole("link", { name: "Manage investment" }).click();
  await expect(page.getByLabel("Owner A", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Owner B", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Long term examples")).toBeChecked();
  await expect(page.getByLabel("Asset class", { exact: true }).locator("option:checked")).toHaveText("Public markets");
  await page.getByLabel("Display name").fill(`${name} renamed`);
  await page.getByLabel("Owner B", { exact: true }).uncheck();
  await page.getByLabel("Long term examples").uncheck();
  await page.getByLabel("Asset class", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Save investment" }).click();
  await expect(page.getByText("Investment updated. Financial history is unchanged.")).toBeVisible();
  expect((await readHistory()).history).toEqual(before);
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue(`${name} renamed`);
  await expect(page.getByLabel("Owner B", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Long term examples")).not.toBeChecked();
  await fitsViewport(page);
  await page.screenshot({ path: testInfo.outputPath("manage.png"), fullPage: true });
  await page.getByRole("button", { name: "Close investment", exact: true }).click();
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(page.getByText("Confirm closure to preserve history and stop later activity.")).toBeVisible();
  await page.getByLabel("I confirm closure and understand that history is preserved.").check();
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(page.getByText("Enter a valid calendar date.")).toBeVisible();
  await page.getByLabel("Close date").fill("2026-02-01");
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(page.getByText("The close date cannot be earlier than recorded actions or valuations.")).toBeVisible();
  await expect(page.getByLabel("Close date")).toHaveValue("2026-02-01");
  await page.getByLabel("Close date").fill("2026-02-02");
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(page.getByText("Investment closed. History is preserved.")).toBeVisible();
  expect((await readHistory()).history).toEqual(before);
  await page.reload();
  await expect(page.getByText(/Closed on 2026-02-02/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Close investment", exact: true })).toHaveCount(0);
  expect((await page.request.post("/api/entries", { headers: { origin }, data: { kind: "contribution", investmentId, date: "2026-02-03", amount: "1" } })).status()).toBe(409);
  await page.goto("/investments");
  await expect(page.getByRole("link", { name: `${name} renamed` })).toBeVisible();
});
