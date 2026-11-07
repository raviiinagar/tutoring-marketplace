import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { first, inboxFixtures } from "./inbox-fixtures";
const viewports = [
  { width: 1366, height: 650 },
  { width: 1536, height: 730 },
  { width: 1280, height: 600 },
  { width: 1440, height: 800 },
  { width: 1920, height: 950 },
  { width: 390, height: 700 },
];
const title =
  "Patient Physics lessons with clear explanations and guided practice for curious school learners studying mechanics and electricity with individual support and exam preparation";
for (const viewport of viewports)
  test(`chat keeps useful message space at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await inboxFixtures(page, false, {
      messageCount: 6,
      title,
      unbroken: true,
    });
    await page.goto("/connections?conversation=" + first);
    const log = page.getByRole("log", { name: "Conversation messages" });
    await expect(log.locator("ol > li")).toHaveCount(6, { timeout: 30000 });
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    const heading = page.getByRole("heading", { name: title, exact: true });
    await expect(heading).toHaveAttribute("title", title);
    await heading.focus();
    await expect(heading).toBeFocused();
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const inbox = await page.locator(".messaging-inbox").boundingBox(),
      messages = await log.boundingBox(),
      composer = await page
        .getByLabel("Message", { exact: true })
        .boundingBox(),
      send = await page
        .getByRole("button", { name: "Send message", exact: true })
        .boundingBox();
    const geometry = await page.evaluate(() => {
      const scrollingAncestors = [];
      let element = document.querySelector("[role=log]")?.parentElement;
      while (element && element !== document.documentElement) {
        const style = getComputedStyle(element);
        if (
          /auto|scroll/.test(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 1
        )
          scrollingAncestors.push(element.className);
        element = element.parentElement;
      }
      return {
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        scrollX,
        scrollY,
        scrollingAncestors,
      };
    });
    const result = {
      ...viewport,
      messageHeight: messages?.height ?? 0,
      inboxHeight: inbox?.height ?? 0,
      ratio: (messages?.height ?? 0) / (inbox?.height ?? 1),
      composerBottom: composer ? composer.y + composer.height : null,
      sendBottom: send ? send.y + send.height : null,
      ...geometry,
    };
    await info.attach("layout-measurements", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    if ([1366, 1920, 390].includes(viewport.width))
      await info.attach(
        `${process.env.INBOX_LAYOUT_PHASE ?? "after"}-${viewport.width}x${viewport.height}`,
        {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        },
      );
    expect.soft(result.messageHeight).toBeGreaterThanOrEqual(240);
    expect.soft(result.ratio).toBeGreaterThanOrEqual(0.45);
    expect.soft(composer).not.toBeNull();
    expect.soft(send).not.toBeNull();
    expect
      .soft(result.composerBottom ?? Infinity)
      .toBeLessThanOrEqual(viewport.height);
    expect
      .soft(result.sendBottom ?? Infinity)
      .toBeLessThanOrEqual(viewport.height);
    expect.soft(geometry.pageHeight).toBeLessThanOrEqual(viewport.height + 1);
    expect.soft(geometry.pageWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect.soft(geometry.scrollY).toBe(0);
    expect.soft(geometry.scrollingAncestors).toEqual([]);
    const axe = await new AxeBuilder({ page })
      .include(".messaging-inbox")
      .analyze();
    expect.soft(axe.violations).toEqual([]);
  });

test("composer grows to five lines, preserves Shift+Enter and the character limit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await inboxFixtures(page, false, { messageCount: 6 });
  await page.goto("/connections?conversation=" + first);
  const input = page.getByLabel("Message", { exact: true });
  await expect(input).toBeEnabled();
  await expect(input).toHaveAttribute("maxlength", "2000");
  const initial = (await input.boundingBox())!.height;
  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.press("a");
  await expect(input).toHaveValue("First line\na");
  await input.fill("One\nTwo\nThree\nFour");
  const grown = (await input.boundingBox())!.height;
  expect(grown).toBeGreaterThan(initial);
  await input.fill("One\nTwo\nThree\nFour\nFive\nSix\nSeven");
  const maximum = await input.boundingBox();
  expect(maximum!.height).toBeLessThanOrEqual(104);
  expect(maximum!.y + maximum!.height).toBeLessThanOrEqual(700);
  expect(
    await input.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  const send = await page
    .getByRole("button", { name: "Send message", exact: true })
    .boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(700);
  await input.fill("");
  expect((await input.boundingBox())!.height).toBe(initial);
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
});

for (const width of [1366, 390])
  test(`short window scrolls the page instead of crushing the log at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 450 });
    await inboxFixtures(page, false, {
      messageCount: 6,
      title,
      unbroken: true,
    });
    await page.goto("/connections?conversation=" + first);
    const log = page.getByRole("log", { name: "Conversation messages" });
    await expect(log.locator("ol > li")).toHaveCount(6);
    expect((await log.boundingBox())!.height).toBeGreaterThanOrEqual(240);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeGreaterThan(450);
    const send = page.getByRole("button", {
      name: "Send message",
      exact: true,
    });
    await send.scrollIntoViewIfNeeded();
    const box = await send.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(450);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
