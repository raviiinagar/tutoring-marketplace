import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** Audit the rendered state, including contrast. Never disable rules to hide a finding. */
export async function auditAccessibility(
  page: Page,
  testInfo: TestInfo,
  state: string,
) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  );
  const result = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ])
    .analyze();
  await testInfo.attach(state + "-accessibility.json", {
    body: JSON.stringify(
      {
        url: page.url(),
        violations: result.violations,
        incomplete: result.incomplete,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(
    result.violations,
    state +
      ": " +
      JSON.stringify(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    state + " horizontal overflow",
  ).toBe(true);
}
