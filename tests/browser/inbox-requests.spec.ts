import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { first, inboxFixtures } from "./inbox-fixtures";

const request = {
  id: "00000000-0000-4000-8000-000000000090",
  server_time: "2026-11-07T00:00:00Z",
  expires_at: "2026-11-07T01:00:00Z",
  created_at: "2026-11-06T00:00:00Z",
  reminder: "DUE_SOON",
  status: "PENDING",
  offer: { title: "Fictional Physics request" },
  learning_requirements: "Work through momentum examples together",
  preferred_times: "Tuesday evenings",
  can_accept: true,
  can_decline: true,
  unavailable_reason: null,
  connection_id: null,
  test_only: true,
};
async function openRequests(page: Page) {
  const summary = page.locator(".inbox-requests > summary");
  await expect(summary).toContainText("on this page");
  await summary.focus();
  await summary.press("Enter");
}
for (const viewport of [
  { width: 1366, height: 650 },
  { width: 390, height: 700 },
])
  test(`Tutor handles requests inside inbox using keyboard at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const fixtures = await inboxFixtures(page, true, { messageCount: 6 });
    let accepted = false,
      decisions = 0;
    await page.route("**/v1/me/tutor-requests**", async (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({ decision: "ACCEPT" });
        decisions++;
        accepted = true;
        await route.fulfill({
          json: {
            request_id: request.id,
            status: "ACCEPTED",
            connection_id: first,
            connection_status: "ACTIVE",
            replayed: false,
          },
        });
      } else
        await route.fulfill({
          json: {
            requests: [
              {
                ...request,
                status: accepted ? "ACCEPTED" : "PENDING",
                can_accept: !accepted,
                can_decline: !accepted,
                connection_id: accepted ? first : null,
              },
            ],
            next_cursor: null,
          },
        });
    });
    await page.goto("/connections");
    await openRequests(page);
    const section = page.getByRole("region", { name: "Incoming requests" });
    await expect(
      section.getByText("Status: PENDING", { exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Open conversation" }),
    ).toHaveCount(0);
    await expect(page.getByRole("log")).toHaveCount(0);
    expect(fixtures.disclosures()).toBe(0);
    expect(
      await page.evaluate(() => Reflect.get(window, "inboxStreams").active),
    ).toBe(0);
    expect(
      (await new AxeBuilder({ page }).include(".messaging-inbox").analyze())
        .violations,
    ).toEqual([]);
    await info.attach(`requests-${viewport.width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    const accept = section.getByRole("button", {
      name: "Accept enquiry",
      exact: true,
    });
    await accept.focus();
    await accept.press("Enter");
    await expect(page).toHaveURL(
      new RegExp("/connections\\?conversation=" + first + "$"),
    );
    await expect(page.getByRole("log").locator("ol > li")).toHaveCount(6);
    await expect(
      page.getByRole("region", { name: "Selected conversation" }),
    ).toBeFocused();
    expect(decisions).toBe(1);
    expect(fixtures.disclosures()).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.goto("/tutor/requests");
    await expect(
      page.getByRole("heading", {
        name: "Incoming Tutor enquiries",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Status: ACCEPTED", { exact: true }),
    ).toBeVisible();
  });

test("Learner requests distinguish error, empty and safe sent status without enabling chat", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const fixtures = await inboxFixtures(page, false);
  let mode = "error";
  await page.route("**/v1/me/contact-requests**", (route) =>
    route.fulfill(
      mode === "error"
        ? { status: 503, json: { code: "UNAVAILABLE" } }
        : {
            json: {
              requests:
                mode === "empty"
                  ? []
                  : [
                      {
                        ...request,
                        learner_usable: true,
                        learner_alias: "Young learner",
                      },
                    ],
              next_cursor: null,
            },
          },
    ),
  );
  await page.goto("/connections");
  const summary = page.locator(".inbox-requests > summary");
  await summary.focus();
  await summary.press("Enter");
  const section = page.getByRole("region", { name: "Sent requests" });
  await expect(section.getByRole("alert")).toBeVisible();
  await expect(section.getByText("No sent requests yet.")).toHaveCount(0);
  mode = "empty";
  await section.getByRole("button", { name: "Refresh requests" }).click();
  await expect(section.getByText("No sent requests yet.")).toBeVisible();
  mode = "pending";
  await section.getByRole("button", { name: "Refresh requests" }).click();
  await expect(section.getByText("Learner: Young learner")).toBeVisible();
  await expect(
    section.getByText("Status: PENDING", { exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: "Accept enquiry" }),
  ).toHaveCount(0);
  await expect(page.getByRole("log")).toHaveCount(0);
  expect(fixtures.disclosures()).toBe(0);
});

test("server deadline equality and stale decisions never open a chat", async ({
  page,
}) => {
  await inboxFixtures(page, true);
  let expired = false;
  await page.route("**/v1/me/tutor-requests**", (route) => {
    if (route.request().method() === "POST") {
      expired = true;
      return route.fulfill({
        status: 409,
        json: { code: "REQUEST_EXPIRED", message: "The request has expired." },
      });
    }
    return route.fulfill({
      json: {
        requests: [
          {
            ...request,
            id: "equal-deadline",
            offer: { title: "Equal deadline request" },
            expires_at: request.server_time,
          },
          {
            ...request,
            status: expired ? "EXPIRED" : "PENDING",
            can_accept: !expired,
            can_decline: !expired,
          },
        ],
        next_cursor: null,
      },
    });
  });
  await page.goto("/connections");
  await openRequests(page);
  const section = page.getByRole("region", { name: "Incoming requests" });
  const equal = section
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Equal deadline request" }),
    });
  await expect(
    equal.getByText("Status: EXPIRED", { exact: true }),
  ).toBeVisible();
  await expect(
    equal.getByRole("button", { name: "Accept enquiry" }),
  ).toHaveCount(0);
  await section
    .getByRole("button", { name: "Accept enquiry", exact: true })
    .click();
  await expect(section.getByRole("alert")).toContainText(
    "The request has expired.",
  );
  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page).toHaveURL(/\/connections$/);
  await expect(
    section.getByRole("button", { name: "Accept enquiry" }),
  ).toHaveCount(0);
});
