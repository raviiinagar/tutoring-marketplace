import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { inboxFixtures } from "./inbox-fixtures";

test("Tutor notices a pending request without focus moving and can reach it from the empty pane", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 650 });
  await inboxFixtures(page, true);
  await page.route("**/v1/me/connections", (route) =>
    route.fulfill({ json: { connections: [], next_cursor: null } }),
  );
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/v1/me/tutor-requests", async (route) => {
    await ready;
    await route.fulfill({
      json: {
        requests: [
          {
            id: "pending-request",
            status: "PENDING",
            server_time: "2026-11-07T00:00:00Z",
            expires_at: "2026-11-07T01:00:00Z",
            can_accept: true,
            can_decline: true,
            offer: { title: "Fictional Physics enquiry" },
            learning_requirements: "Practice momentum with worked examples",
            preferred_times: "Tuesday evenings",
            unavailable_reason: null,
            connection_id: null,
            test_only: true,
          },
        ],
        next_cursor: null,
      },
    });
  });
  await page.goto("/connections");
  const search = page.getByRole("searchbox", { name: "All my contacts" });
  await search.focus();
  release();
  const summary = page.locator(".inbox-requests > summary");
  await expect(summary).toContainText("1");
  await page.evaluate(() => document.fonts.ready);
  await info.attach(
    `requests-polish-${process.env.INBOX_POLISH_PHASE ?? "after"}-1366x650`,
    {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    },
  );
  await expect(search).toBeFocused();
  await expect(page.locator(".inbox-requests")).toHaveAttribute("open", "");
  await expect(summary).toHaveText("Requests (1 pending)");
  const pane = page.getByRole("region", { name: "Messages", exact: true });
  await expect(pane).toContainText(
    "No conversations yet. Accepted enquiries appear here.",
  );
  await expect(pane).not.toContainText("You haven't found a teacher yet.");
  await summary.focus();
  await summary.press("Enter");
  await expect(page.locator(".inbox-requests")).not.toHaveAttribute("open");
  const link = pane.getByRole("link", {
    name: "View pending requests",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "#inbox-requests");
  await link.focus();
  await link.press("Enter");
  await expect(summary).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Accept enquiry", exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".messaging-inbox").analyze())
      .violations,
  ).toEqual([]);
});
