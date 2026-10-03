import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("canonical reporting scopes and context persist on desktop and phone", async ({ page }, info) => {
  await signIn(page);
  const prefix = "Synthetic scope " + info.project.name;
  const headers = { origin: new URL(page.url()).origin };
  const definitions = [
    ["owners", "Owner A"], ["owners", "Owner B"], ["customGroups", "Group A"],
    ["customGroups", "Group B"], ["customGroups", "Unused group"], ["assetClasses", "Asset"],
    ["accountTypes", "Account"], ["taxStatuses", "Tax"], ["liquidities", "Liquidity"], ["institutions", "Institution"],
  ] as const;
  for (const [dimension, label] of definitions) {
    expect((await page.request.post("/api/settings", { headers,
      data: { dimension, operation: "create", label: prefix + " " + label } })).status()).toBe(200);
  }
  const { choices } = await (await page.request.get("/api/investments")).json();
  function id(dimension: string, label: string): string {
    return choices[dimension].find((item: { label: string }) => item.label === prefix + " " + label).id;
  }
  const ownerA = id("owners", "Owner A"), ownerB = id("owners", "Owner B");
  const groupA = id("customGroups", "Group A"), groupB = id("customGroups", "Group B");
  async function create(name: string, ownerIds: string[], groupIds: string[], extra = {}) {
    const response = await page.request.post("/api/investments", { headers, data: {
      operation: "create", name: prefix + " " + name, ownerIds, groupIds, ...extra,
    } });
    expect(response.status()).toBe(200);
    return (await response.json()).id as string;
  }
  const source = await create("Source", [ownerA, ownerB], [groupA, groupB], {
    assetClassId: id("assetClasses", "Asset"), accountTypeId: id("accountTypes", "Account"),
    taxStatusId: id("taxStatuses", "Tax"), liquidityId: id("liquidities", "Liquidity"), institutionId: id("institutions", "Institution"),
  });
  const destination = await create("Destination", [ownerB], [groupB]);
  async function entry(data: object) {
    expect((await page.request.post("/api/entries", { headers, data })).status()).toBe(200);
  }
  for (const [investmentId, opening, ending] of [[source, "100", "60"], [destination, "0", "40"]]) {
    await entry({ kind: "valuation", operation: "create", investmentId, date: "2026-01-01", grossValue: opening, debt: "0" });
    await entry({ kind: "valuation", operation: "create", investmentId, date: "2026-10-01", grossValue: ending, debt: "0" });
  }
  await entry({ kind: "contribution", investmentId: source, date: "2026-01-01", amount: "100" });
  await entry({ kind: "transfer", sourceInvestmentId: source, destinationInvestmentId: destination, date: "2026-06-01", amount: "40" });
  const headline = page.locator(".page-heading .headline-number");
  const underlying = page.getByRole("region", { name: "Underlying investments" });
  async function open(query: string, value: string, count: number) {
    await page.goto("/?date=2026-10-01&range=ytd&" + query);
    await expect(headline).toContainText(value);
    await expect(underlying.locator(".investment-row")).toHaveCount(count);
  }
  await open("owner=" + ownerA, "$60.00", 1);
  await expect(page.locator(".overview-period")).toContainText("−$40.00");
  await expect(page.locator(".overview-scope-label")).toContainText(prefix + " Owner A");
  await open("owner=" + ownerB, "$100.00", 2); // The joint source appears only once.
  await open("group=" + groupA + "&group=" + groupB, "$100.00", 2);
  for (const [key, dimension, label] of [
    ["assetClass", "assetClasses", "Asset"], ["accountType", "accountTypes", "Account"],
    ["taxStatus", "taxStatuses", "Tax"], ["liquidity", "liquidities", "Liquidity"], ["institution", "institutions", "Institution"],
  ]) await open(key + "=" + id(dimension, label), "$60.00", 1);

  // Use the real disclosure/checkbox controls, combining owner, group and classifications.
  await page.getByText("Choose reporting scope", { exact: true }).click();
  const filters = page.locator(".reporting-scope-controls");
  await filters.locator(".scope-dimension").filter({ has: page.locator("summary", { hasText: /^Owner ·/ }) }).locator("summary").click();
  await filters.getByLabel(prefix + " Owner A", { exact: true }).check();
  await filters.locator(".scope-dimension").filter({ has: page.locator("summary", { hasText: /^Custom group ·/ }) }).locator("summary").click();
  await filters.getByLabel(prefix + " Group A", { exact: true }).check();
  await page.getByLabel("Performance period", { exact: true }).selectOption("1y");
  await page.getByRole("button", { name: "Update overview" }).click();
  await expect(headline).toContainText("$60.00");
  await expect(page.locator(".overview-scope-label")).toContainText("Owner:");
  await expect(page.locator(".overview-scope-label")).toContainText("Custom group:");
  await expect(page.locator(".overview-scope-label")).toContainText("Institution:");
  const scopeUrl = new URL(page.url());
  for (const key of ["owner", "group", "institution"]) expect(scopeUrl.searchParams.has(key)).toBe(true);
  const trend = page.getByRole("region", { name: "Value over time" });
  const composition = page.getByRole("region", { name: "Composition over time" });
  await trend.getByRole("button", { name: "3M", exact: true }).click();
  await composition.getByLabel("Group by").selectOption("ownerSet");
  expect(page.url()).toBe(scopeUrl.toString());
  await expect(trend).toContainText("$60.00");
  await expect(composition).toContainText("$60.00");
  const groupOptions = await composition.getByLabel("Group by").locator("option").allTextContents();
  expect(groupOptions.join(" ")).not.toContain("Custom group");
  await page.getByLabel("Reporting date", { exact: true }).fill("2026-09-01");
  await page.getByRole("button", { name: "Update overview" }).click();
  await expect(headline).toContainText("$100.00");
  for (const key of ["owner", "group", "institution"]) expect(new URL(page.url()).searchParams.get(key)).toBe(scopeUrl.searchParams.get(key));
  await expect(underlying.getByRole("link", { name: prefix + " Source", exact: true })).toHaveAttribute("href", "/investments/" + source + "?date=2026-09-01");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByText("Choose reporting scope", { exact: true }).click();
  const ownerDimension = filters.locator(".scope-dimension").filter({ has: page.locator("summary", { hasText: /^Owner ·/ }) });
  await ownerDimension.locator("summary").click();
  expect((await ownerDimension.getByText(prefix + " Owner A", { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await filters.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("reporting-scope.png") });

  // Date resolution for a shared scope link also retains every repeated identity.
  await page.goto("/?owner=" + ownerA + "&group=" + groupA + "&group=" + groupB);
  await expect(page.getByLabel("Reporting date", { exact: true })).toHaveValue(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  expect(new URL(page.url()).searchParams.getAll("group")).toEqual([groupA, groupB].sort());
  expect(new URL(page.url()).searchParams.get("owner")).toBe(ownerA);
  await page.getByRole("link", { name: "Reset to All tracked investments", exact: true }).first().click();
  await expect(page.locator(".overview-scope-label")).toContainText("All tracked investments");
  expect(new URL(page.url()).searchParams.has("date")).toBe(true);
  expect(new URL(page.url()).searchParams.has("owner")).toBe(false);
  await page.goto("/?date=2026-10-01&group=" + id("customGroups", "Unused group"));
  await expect(page.getByRole("heading", { name: "No investments in this reporting scope" })).toBeVisible();
  await expect(page.getByText(/No contributions are recorded/).first()).toBeVisible();

  await create("Missing", [ownerA], [groupA]);
  await page.goto("/?date=2026-10-01&owner=" + ownerA);
  await expect(headline).toContainText("Valuation coverage is incomplete");
  await expect(page.getByText("1 of 2 investments valued", { exact: true })).toBeVisible();
  await open("investment=" + source + "&investment=" + destination, "$100.00", 2);
  await entry({ kind: "valuation", operation: "replace", investmentId: source, date: "2026-10-01", grossValue: "20", debt: "40" });
  await open("investment=" + source, "−$20.00", 1);
  await expect(page.getByText(/An acceptable annualized return could not be calculated/).first()).toBeVisible();
});
