import { expect, type Page, type TestInfo } from "@playwright/test";

const dimensions = [
  ["assetClasses", "Asset classes", "Asset class"], ["accountTypes", "Account types", "Account type"],
  ["taxStatuses", "Tax statuses", "Tax status"], ["liquidities", "Liquidity", "Liquidity"],
  ["institutions", "Institutions", "Institution"], ["customGroups", "Custom groups", "Custom groups"],
] as const;

/** Runs after clean first-run setup: no demo classification records are available. */
export async function settingsWorkflow(page: Page, info: TestInfo) {
  const initial = await (await page.request.get("/api/settings")).json();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Household name")).toHaveValue("Sample household");
  await page.getByLabel("Household name").fill("Renamed sample household");
  await page.getByRole("region", { name: "Household", exact: true }).getByRole("button", { name: "Save name" }).click();
  await expect(page.getByLabel("Household name")).toHaveValue("Renamed sample household");
  const owners = page.getByRole("region", { name: "Owners", exact: true });
  await owners.getByLabel("New value").fill("Owner C");
  let writes = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "POST") { writes++; await released; }
    await route.continue();
  });
  await owners.getByRole("button", { name: "Add value" }).click();
  await expect(owners.getByLabel("New value")).toBeDisabled();
  await expect(owners.getByRole("button", { name: "Add value" })).toBeDisabled();
  expect(writes).toBe(1); release();
  await expect(owners.getByLabel("Name for Owner C")).toBeVisible();
  await page.unroute("**/api/settings");
  await page.goto("/investments/new");
  await expect(page.getByLabel("Owner C", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Manage classifications and custom groups" }).click();
  for (const [dimension, title] of dimensions) {
    const region = page.getByRole("region", { name: title, exact: true });
    await expect(region.getByText("No values configured yet.")).toBeVisible();
    await region.getByLabel("New value").fill(`Sample ${dimension}`);
    await region.getByRole("button", { name: "Add value" }).click();
    await expect(region.getByLabel(`Name for Sample ${dimension}`)).toBeVisible();
    await region.getByLabel("New value").fill(` Sample ${dimension} `);
    await region.getByRole("button", { name: "Add value" }).click();
    await expect(region.getByRole("alert")).toContainText("already exists");
    await expect(region.getByLabel("New value")).toHaveValue(` Sample ${dimension} `);
    await region.getByLabel("New value").fill("Unused sample");
    await region.getByRole("button", { name: "Add value" }).click();
    const unused = region.locator("form").filter({ has: page.getByLabel("Name for Unused sample") });
    await unused.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(unused.getByText(/Only unused values/)).toBeVisible();
    await unused.getByRole("button", { name: "Cancel removal" }).click();
    await expect(unused.getByLabel("Name for Unused sample")).toBeVisible();
    await unused.getByRole("button", { name: "Remove", exact: true }).click();
    await unused.getByRole("button", { name: "Confirm removal" }).click();
    await expect(region.getByLabel("Name for Unused sample")).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Return to investment form" }).click();
  await page.getByLabel("Display name").fill("Classified sample investment");
  await page.getByLabel("Owner C", { exact: true }).check();
  for (const [dimension, , field] of dimensions) {
    if (dimension === "customGroups") await page.getByLabel(`Sample ${dimension}`, { exact: true }).check();
    else await page.getByLabel(field, { exact: true }).selectOption({ label: `Sample ${dimension}` });
  }
  await page.getByRole("button", { name: "Create investment", exact: true }).click();
  await page.getByRole("link", { name: "View investment", exact: true }).click();
  await expect(page).toHaveURL(/\/investments\/[\da-f-]{36}$/);
  const investmentId = new URL(page.url()).pathname.split("/").at(-1)!;
  const origin = new URL(page.url()).origin;
  for (const entry of [{ kind: "contribution", amount: "10" }, { kind: "valuation", operation: "create", grossValue: "20", debt: "30" }]) {
    expect((await page.request.post("/api/entries", { headers: { origin }, data: { ...entry, investmentId, date: "2026-01-01" } })).status()).toBe(200);
  }
  const historyBefore = (await (await page.request.get(`/api/history?investmentId=${investmentId}`)).json()).history;
  const metadataBefore = (await (await page.request.get(`/api/investments?investmentId=${investmentId}`)).json()).investment;
  await page.getByRole("link", { name: "Manage investment", exact: true }).click();
  await page.getByRole("link", { name: "Manage classifications and custom groups" }).click();
  for (const [dimension, title] of dimensions) {
    const region = page.getByRole("region", { name: title, exact: true });
    await region.getByLabel(`Name for Sample ${dimension}`).fill(`Renamed ${dimension}`);
    await region.getByRole("button", { name: "Save name" }).click();
    await expect(region.getByLabel(`Name for Renamed ${dimension}`)).toBeVisible();
    await region.getByRole("button", { name: "Remove", exact: true }).click();
    await region.getByRole("button", { name: "Confirm removal" }).click();
    await expect(region.getByRole("alert")).toContainText("used by an investment");
    await region.getByRole("button", { name: "Cancel removal" }).click();
  }
  await page.getByRole("link", { name: "Household & owners", exact: true }).click();
  await owners.getByLabel("Name for Owner C").fill("Renamed Owner C");
  const editor = owners.locator("form").filter({ has: page.getByLabel("Name for Owner C") });
  await editor.getByRole("button", { name: "Save name" }).click();
  const renamed = owners.locator("form").filter({ has: page.getByLabel("Name for Renamed Owner C") });
  await expect(renamed).toBeVisible();
  await renamed.getByRole("button", { name: "Remove", exact: true }).click();
  await renamed.getByRole("button", { name: "Confirm removal" }).click();
  await expect(renamed.getByRole("alert")).toContainText("used by an investment");
  await owners.getByLabel("New value").fill("Unused owner");
  await owners.getByRole("button", { name: "Add value" }).click();
  const unusedOwner = owners.locator("form").filter({ has: page.getByLabel("Name for Unused owner") });
  await unusedOwner.getByRole("button", { name: "Remove", exact: true }).click();
  await unusedOwner.getByRole("button", { name: "Confirm removal" }).click();
  await expect(owners.getByLabel("Name for Unused owner")).toHaveCount(0);
  const control = page.getByLabel("Household name");
  await control.focus();
  expect(await control.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("settings.png"), fullPage: true });
  await page.getByRole("link", { name: "Return to investment form" }).click();
  await expect(page.getByLabel("Renamed Owner C", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Renamed customGroups", { exact: true })).toBeChecked();
  for (const [dimension, , field] of dimensions) if (dimension !== "customGroups") await expect(page.getByLabel(field, { exact: true }).locator("option:checked")).toHaveText(`Renamed ${dimension}`);
  const after = await (await page.request.get("/api/settings")).json();
  expect(after.household.id).toBe(initial.household.id);
  expect((await (await page.request.get(`/api/investments?investmentId=${investmentId}`)).json()).investment).toEqual(metadataBefore);
  expect((await (await page.request.get(`/api/history?investmentId=${investmentId}`)).json()).history).toEqual(historyBefore);
}
