import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("investment actions retain context, return after saving, and respect eligibility", async ({ page }, testInfo) => {
  await signIn(page);
  const headers = { origin: new URL(page.url()).origin };
  const { choices } = await (await page.request.get("/api/investments")).json();
  const response = await page.request.post("/api/investments", { headers, data: {
    operation: "create", name: "Synthetic action context " + testInfo.project.name,
    ownerIds: [choices.owners[0].id], groupIds: [],
  } });
  expect(response.status()).toBe(200);
  const { id } = await response.json();
  const detailHref = "/investments/" + id + "?date=2026-02-01&start=2024-01-01";
  await page.goto(detailHref);
  await page.getByRole("link", { name: "Add financial action", exact: true }).click();
  await expect(page).toHaveURL(/\/add\?investmentId=/);
  const launcherHref = page.url();
  for (const [label, field] of [["Contribution", "Investment"], ["Withdrawal / Distribution", "Investment"], ["Valuation Mark", "Investment"], ["Transfer", "Move value from"]]) {
    await page.getByRole("link", { name: new RegExp("^" + label) }).click();
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(id);
    await expect(page.getByLabel(label === "Valuation Mark" ? "As-of date" : "Effective date", { exact: true })).toHaveValue("2026-02-01");
    if (label === "Transfer") {
      await expect(page.getByLabel("Move value to", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Move value to", { exact: true }).locator('option[value="' + id + '"]')).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole("link", { name: "All actions" }).click();
    await expect(page).toHaveURL(launcherHref);
  }
  await page.getByRole("link", { name: /^Contribution/ }).click();
  await page.getByRole("link", { name: "Choose another action" }).click();
  await expect(page).toHaveURL(launcherHref);
  await page.getByRole("link", { name: /^Contribution/ }).click();
  await page.getByLabel("Effective date").fill("2026-01-15");
  await page.getByLabel("Amount contributed").fill("12.34");
  await page.getByRole("button", { name: "Save contribution" }).click();
  await expect(page.getByRole("heading", { name: "Contribution saved" })).toBeVisible();
  await page.getByRole("link", { name: "Return to investment" }).click();
  await expect(page).toHaveURL(new URL(detailHref, page.url()).toString());
  await expect(page.getByLabel("Reporting date")).toHaveValue("2026-02-01");
  await expect(page.getByLabel("Period start")).toHaveValue("2024-01-01");

  // Global navigation drops the launch default; direct action routes still work.
  await page.getByRole("link", { name: "Add entry", exact: true }).click();
  await expect(page).toHaveURL(/\/add$/);
  await page.getByRole("link", { name: /^Contribution/ }).click();
  await expect(page.getByLabel("Investment", { exact: true })).toHaveValue("");
  await page.goto("/add/transfer");
  await expect(page.getByLabel("Move value from", { exact: true })).toHaveValue("");

  expect((await page.request.post("/api/investments", { headers, data: {
    operation: "close", investmentId: id, closedOn: "2026-01-15", confirmed: true,
  } })).status()).toBe(200);
  await page.goto(detailHref);
  await expect(page.getByRole("link", { name: "Add financial action" })).toHaveCount(0);
  for (const kind of ["contribution", "withdrawal", "valuation", "transfer"]) {
    for (const investmentId of [id, "00000000-0000-0000-0000-000000000078"]) {
      await page.goto("/add/" + kind + "?investmentId=" + investmentId + "&date=2026-02-01");
      await expect(page.getByLabel(kind === "transfer" ? "Move value from" : "Investment", { exact: true })).toHaveValue("");
      await expect(page.getByText("The selected investment is unavailable on this date. Choose an eligible investment or change the date.")).toBeVisible();
    }
  }
  const rejected = await page.request.post("/api/entries", { headers, data: { kind: "contribution", investmentId: id, date: "2026-02-01", amount: "1" } });
  expect(rejected.status()).toBe(409);
});
