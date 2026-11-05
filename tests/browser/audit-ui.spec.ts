import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auditSupply } from "./audit-ui-fixtures";

test("QA01: visible labels remain in accessible names on home and search at desktop and mobile widths", async ({ page, request, baseURL }, info) => {
  test.setTimeout(180000);
  await auditSupply(request, baseURL!);
  const checks = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["/", "/tutors?subject_id=subject-physics"]) {
      await page.goto(route);
      await expect(page.getByRole("combobox", { name: "Subject or exam", exact: true })).toBeEnabled({ timeout: 45000 });
      await expect(page.locator(".teacher-cover").first()).toBeVisible();
      await expect(page.locator(".teacher-cover")).toHaveCount(2);
      // Both public introduction and teaching-offer variants must be present.
      await expect(page.locator('.teacher-cover[href^="/profiles/"]')).toHaveCount(1);
      await expect(page.locator('.teacher-cover[href^="/teachers/"]')).toHaveCount(1);
      if (route === "/") await page.evaluate(() => window.scrollTo(0, 350));
      await expect(page.locator(".header-search-trigger:visible")).toBeEnabled();
      const result = await new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]).analyze();
      checks.push({ width, route, violations: result.violations });
      expect(result.violations).toEqual([]);
    }
  }
  await info.attach("QA01 axe results", { body: JSON.stringify(checks, null, 2), contentType: "application/json" });
});
test("QA01: repeat the twelve audit accessibility combinations", async ({ page, request, baseURL }, info) => {
  test.setTimeout(240000);
  await auditSupply(request, baseURL!);
  const checks = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const route of ["/", "/tutors", "/auth/signin", "/auth/signup", "/auth/check-email", "/auth/forgot-password"]) {
      await page.goto(route);
      if (route === "/") {
        await expect(page.getByRole("combobox", { name: "Subject or exam", exact: true })).toBeEnabled({ timeout: 45000 });
        await page.evaluate(() => window.scrollTo(0, 350));
      }
      await expect(page.locator(".header-search-trigger").first()).toBeEnabled({ timeout: 45000 });
      if (route === "/" || route === "/tutors")
        await expect(page.locator('.teacher-cover[href^="/profiles/"]').first()).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]).analyze();
      checks.push({ width, route, violations: result.violations.map(({ id, impact, nodes }) => ({
        id, impact, nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
      })) });
      expect(result.violations.filter(({ id }) => id === "label-content-name-mismatch")).toEqual([]);
    }
  }
  await info.attach("Twelve audit accessibility combinations", { body: JSON.stringify(checks, null, 2), contentType: "application/json" });
});
