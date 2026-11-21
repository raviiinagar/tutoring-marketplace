import { expect, type Page } from "@playwright/test";

export async function openAccountSettings(page: Page) {
  await page.getByRole("link", { name: /^My account$/i }).click();
  await expect(page.getByRole("heading", { name: "General Information", exact: true })).toBeVisible();
}
/** The Learner dashboard shows its learning tools and Access Pass card directly (no collapsed box). */
export async function openLearningTools(page: Page) {
  await expect(page.getByRole("navigation", { name: "Learning tools and access", exact: true })).toBeVisible();
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
/** Answers "I want to: Learn or Teach" in My Account (ADR0021) and waits for it to save. */
export async function chooseRoles(page: Page, choice: "Learn" | "Teach") {
  const saved = page.waitForResponse(r => r.url().endsWith("/v1/me/roles") && r.request().method() === "POST");
  await page.locator("#roles").getByRole("radio", { name: new RegExp("^" + choice) }).check();
  expect((await saved).status()).toBe(200);
}
/**
 * "Both" is no longer offered in My Account, but the roles contract still accepts it and
 * existing dual-role accounts keep it. Fixtures that need one set it through the API.
 */
export async function keepBothRoles(page: Page) {
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
  const saved = await page.request.post("/v1/me/roles", { headers: { Origin: origin }, data: { roles: ["LEARNER", "TUTOR"] } });
  expect(saved.status()).toBe(200);
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
