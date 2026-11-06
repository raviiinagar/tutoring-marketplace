import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { auditAccount, auditSupply } from "./audit-ui-fixtures";

test("QA01: visible labels remain in accessible names on home and search at desktop and mobile widths", async ({ page, request, baseURL }, info) => {
  test.setTimeout(180000);
  const retireSupply = await auditSupply(request, baseURL!);
  try {
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
  } finally { await retireSupply(); }
});
test("QA01: repeat the twelve audit accessibility combinations", async ({ page, request, baseURL }, info) => {
  test.setTimeout(240000);
  const retireSupply = await auditSupply(request, baseURL!);
  try {
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
  } finally { await retireSupply(); }
});

test("QA05: keyboard start-teaching opens the private wizard without granting a role", async ({ page, baseURL }, info) => {
  test.setTimeout(120000);
  await auditAccount(page.request, baseURL!);
  let roleWrites = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/v1/me/roles") roleWrites++;
  });
  const checks = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const source of ["/account", "/account/settings"]) {
      await page.goto(source);
      const menu = page.getByRole("button", { name: width < 1024 ? "F Open menu" : "F My account menu", exact: true });
      await expect(menu).toBeEnabled({ timeout: 45000 });
      await menu.focus();
      await page.keyboard.press("Enter");
      const start = width < 1024
        ? page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Give private classes", exact: true })
        : page.getByRole("menuitem", { name: "Give private classes", exact: true });
      await expect(start).toHaveAttribute("href", "/tutor");
      await start.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/tutor$/);
      await expect(page.getByRole("main")).toBeFocused();
      const subject = page.getByRole("checkbox", { name: "Physics", exact: true });
      await expect(subject).toBeEnabled();
      await expect(subject).not.toBeChecked();
      await subject.focus();
      await page.keyboard.press("Space");
      await expect(subject).toBeChecked();
      await expect(page.getByRole("button", { name: "Save private draft", exact: true })).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]).analyze();
      expect(result.violations).toEqual([]);
      const me = await (await page.request.get("/v1/me")).json();
      expect(me.user.roles).toEqual(["LEARNER"]);
      expect(roleWrites).toBe(0);
      checks.push({ width, source, destination: "/tutor", focus: "Main on navigation, subject usable with keyboard", roleWrites, violations: result.violations.length });
    }
  }
  await info.attach("QA05 keyboard and mobile results", { body: JSON.stringify(checks, null, 2), contentType: "application/json" });
});
