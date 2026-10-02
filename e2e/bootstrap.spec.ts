import { expect, test } from "@playwright/test";

test("clean migrations -> authenticated household setup -> first unclassified investment", async ({ page }) => {
  await page.goto("/investments/new");
  await expect(page).toHaveURL(/[/]login$/);
  await page.getByLabel("App password").fill("synthetic-equinox-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/[/]setup$/);
  await expect(page.getByRole("heading", { level: 1, name: "Set up your household" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  for (const path of ["/", "/updates", "/add", "/valuations/batch", "/investments/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/[/]setup$/);
  }
  const name = page.getByLabel("Household display name");
  await name.fill("Sample household");
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page.getByText("Enter names of 1–200 characters.")).toBeVisible();
  await expect(name).toHaveValue("Sample household");
  await page.getByLabel("Owner 1 name").fill("Owner A");
  await page.getByRole("button", { name: "Add another owner" }).click();
  await page.getByLabel("Owner 2 name").fill("Owner B");
  await name.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Owner 1 name")).toBeFocused();
  expect(await page.getByLabel("Owner 1 name").evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
  expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Let the real server commit, but lose its first response. Retry must preserve
  // both identities and must not create more household/owner rows.
  let writes = 0;
  await page.route("**/api/setup", async (route) => {
    writes++;
    if (writes === 1) { await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page.getByText("Unable to confirm setup. Your values are still here; retry safely.")).toBeVisible();
  await expect(name).toHaveValue("Sample household");
  const before = await (await page.request.get("/api/investments")).json();
  expect(before.choices.owners).toHaveLength(2);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/[/]investments[/]new$/);
  const after = await (await page.request.get("/api/investments")).json();
  expect(after.choices).toEqual(before.choices);
  expect(writes).toBe(2);
  await page.unroute("**/api/setup");
  await expect(page.getByRole("heading", { name: "Add investment", exact: true })).toBeVisible();
  for (const label of ["Asset class", "Account type", "Tax status", "Liquidity", "Institution"]) {
    await expect(page.getByLabel(label, { exact: true }).locator("option")).toHaveCount(1);
  }
  await page.getByLabel("Display name").fill("First sample investment");
  await page.getByLabel("Owner A", { exact: true }).check();
  await page.getByRole("button", { name: "Create investment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Investment created", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View investment", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "First sample investment" })).toBeVisible();
  await expect(page.getByText(/Valuation coverage is incomplete/).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Investments", exact: true }).click();
  await expect(page.getByRole("link", { name: "First sample investment", exact: true })).toBeVisible();
  await page.goto("/setup");
  await expect(page.getByRole("heading", { level: 1, name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create household" })).toHaveCount(0);
});
