import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("App password").fill("synthetic-equinox-test-password");
  const loginResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status(), "synthetic browser-test login should succeed").toBe(200);
  await expect(page).toHaveURL(/\/(?:\?date=[0-9-]+&range=ytd)?$/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
}

export async function openHistory(page: Page, name: string) {
  await page.goto("/investments/history");
  await page.getByLabel("Investment", { exact: true }).selectOption({ label: name });
  await expect(page.getByText("Loading history…")).toBeHidden();
}

export function historyItem(page: Page, heading: string, date: string) {
  return page.locator("article.history-item")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .filter({ hasText: date });
}

export function batchRow(page: Page, name: string) {
  return page.locator("section.batch-row")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
