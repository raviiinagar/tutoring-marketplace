import { expect, type Page } from "@playwright/test";

export async function openAccountSettings(page: Page) {
  await page.getByRole("link", { name: /^My account$/i }).click();
  await expect(page.getByRole("heading", { name: "General Information", exact: true })).toBeVisible();
}
export async function openLearningTools(page: Page) {
  const summary = page.locator("summary").filter({ hasText: /^Learning tools and access$/ });
  if (!(await summary.evaluate(element => element.parentElement!.hasAttribute("open")))) await summary.click();
}
export async function openAccountHelp(page: Page) {
  await openAccountSettings(page);
  await page.locator("summary").filter({ hasText: /^Help and support$/ }).click();
}
export async function openAdminConsole(page: Page) {
  await openAccountHelp(page);
  await page.getByRole("link", { name: "Open admin dashboard", exact: true }).click();
}
export async function openRoles(page: Page) {
  await openAccountSettings(page);
  await page.locator("#roles").scrollIntoViewIfNeeded();
}
/** Answers "I want to: Learn, Teach or Both" in My Account (ADR0021) and waits for it to save. */
export async function chooseRoles(page: Page, choice: "Learn" | "Teach" | "Both") {
  const saved = page.waitForResponse(r => r.url().endsWith("/v1/me/roles") && r.request().method() === "POST");
  await page.locator("#roles").getByRole("radio", { name: new RegExp("^" + choice) }).check();
  expect((await saved).status()).toBe(200);
}
export async function openSecurity(page: Page) {
  if (!(await page.locator("#security").evaluate(element => element.hasAttribute("open"))))
    await page.locator("#security > summary").click();
}
export async function openAdminArea(page: Page, name: string) {
  let navigation = page.getByRole("navigation", { name: "Admin navigation", exact: true });
  if (!(await navigation.isVisible())) {
    await page.getByLabel("Open admin navigation", { exact: true }).click();
    navigation = page.getByRole("navigation", { name: "Mobile admin navigation", exact: true });
  }
  await navigation.getByRole("link", { name, exact: true }).click();
}
