import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const first = "00000000-0000-4000-8000-000000000001",
  second = "00000000-0000-4000-8000-000000000002",
  held = "00000000-0000-4000-8000-000000000003";
async function inboxFixtures(page: Page, tutor: boolean) {
  const rows = [first, second, held].map((id, index) => ({
    id,
    request_id: "request-" + id,
    listing_id: "listing-" + id,
    offer: {
      title: [
        "Physics conversation",
        "Guitar conversation",
        "Unavailable conversation",
      ][index],
      description: "Fictional class",
      domain_id: "school",
      subject_id: "subject-physics",
      level_id: "level-class-10",
      curriculum_id: "curriculum-cbse",
      language_ids: ["language-english"],
      currency: "INR",
      teaching_mode: "ONLINE",
      rate_paise: 50000,
      rate_unit: "HOUR",
      trial_kind: "NONE",
    },
    status: "ACTIVE",
    available: id !== held,
    unread_count: id === held ? null : 1,
    unavailable_reason: id === held ? "CONNECTION_RESTRICTED" : null,
    created_at: "2026-11-07T00:00:00Z",
    test_only: true,
  }));
  const reads = new Map<string, number>();
  let disclosures = 0;
  const state = (id: string) => ({
    connection_id: id,
    conversation_id: "conversation-" + id,
    offer_title: rows.find((row) => row.id === id)!.offer.title,
    your_role: tutor ? "TUTOR" : "PAYER",
    learner_kind: "ADULT",
    messages: [
      {
        sequence: 1,
        client_message_id: "message-" + id,
        text: "Private reply for " + id,
        sender_role: tutor ? "PAYER" : "TUTOR",
        your_message: false,
        created_at: "2026-11-07T00:00:00Z",
      },
    ],
    last_sequence: 1,
    next_after: 1,
    has_more: false,
    has_older: false,
    read_sequence: reads.get(id) ?? 0,
    peer_read_sequence: 0,
    unread_count: reads.get(id) ? 0 : 1,
  });
  await page.addInitScript(
    ({ frames }) => {
      const counts = { active: 0, maximum: 0 };
      Object.assign(window, { inboxStreams: counts });
      class Source extends EventTarget {
        onerror: null | (() => void) = null;
        closed = false;
        timer: ReturnType<typeof setTimeout>;
        constructor(url: string) {
          super();
          const id = new URL(url, location.origin).pathname.split("/")[4];
          counts.active++;
          counts.maximum = Math.max(counts.maximum, counts.active);
          this.timer = setTimeout(() => {
            if (!this.closed)
              this.dispatchEvent(
                new MessageEvent("state", { data: JSON.stringify(frames[id]) }),
              );
          }, 0);
        }
        close() {
          if (!this.closed) {
            this.closed = true;
            clearTimeout(this.timer);
            counts.active--;
          }
        }
      }
      Object.assign(window, { EventSource: Source });
    },
    {
      frames: Object.fromEntries([first, second].map((id) => [id, state(id)])),
    },
  );
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    let body: unknown,
      status = 200;
    if (path === "/v1/me")
      body = {
        user: {
          id: "fictional-inbox-user",
          display_name: "Fictional Inbox",
          email: "inbox@example.test",
          email_verified: true,
          roles: tutor ? ["TUTOR"] : ["LEARNER"],
          created_at: "2026-11-07",
        },
      };
    else if (path === "/v1/me/tutor/photo") body = { photo: null };
    else if (path === "/v1/me/connections")
      body = {
        connections: rows.map((row) => ({
          ...row,
          unread_count: row.available ? (reads.get(row.id) ? 0 : 1) : null,
        })),
        next_cursor: null,
      };
    else {
      const id = path.split("/")[4],
        row = rows.find((row) => row.id === id);
      if (!row || id === held) {
        status = id === held ? 403 : 404;
        body = {
          code: "CONNECTION_RESTRICTED",
          message: "This Connection is restricted.",
        };
      } else if (path.endsWith("/messages")) body = state(id);
      else if (path.endsWith("/read-position")) {
        reads.set(id, 1);
        body = { read_sequence: 1, peer_read_sequence: 0, unread_count: 0 };
      } else if (path.endsWith("/contacts")) {
        disclosures++;
        body = {
          peer: {
            display_name: "Fictional peer",
            email: "peer@example.test",
            email_verified: true,
            role: tutor ? "ADULT_LEARNER" : "TUTOR",
          },
        };
      } else if (path.endsWith("/classes"))
        body = {
          viewer_role: tutor ? "TUTOR" : "PAYER",
          server_time: "2026-11-07T00:00:00Z",
          classes: [],
        };
      else
        body = {
          connection: {
            ...row,
            your_role: tutor ? "TUTOR" : "PAYER",
            learner_kind: "ADULT",
            learning_requirements: "Fictional private learning goals",
            preferred_times: "Tuesday evenings",
          },
        };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return { disclosures: () => disclosures };
}
for (const tutor of [false, true])
  for (const width of [1440, 390])
    test(`unified inbox ${tutor ? "Tutor" : "Learner"} at ${width}px`, async ({
      page,
    }, info) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 844 });
      const fixtures = await inboxFixtures(page, tutor);
      await page.goto("/connections");
      await expect(
        page.getByRole("link", { name: /Physics conversation/ }),
      ).toBeVisible({ timeout: 30000 });
      await page.evaluate(() =>
        Object.assign(window, { inboxDocument: "same-document" }),
      );
      const navigation = page.getByRole("navigation", {
        name: tutor ? "Teaching workspace navigation" : "Workspace navigation",
      });
      await expect(navigation).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "Incoming Tutor enquiries",
          exact: true,
        }),
      ).toHaveCount(tutor ? 1 : 0);
      const physics = page.getByRole("link", { name: /Physics conversation/ });
      await physics.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(
        new RegExp("/connections\\?conversation=" + first + "$"),
      );
      const pane = page.getByRole("region", { name: "Selected conversation" });
      await expect(pane).toBeFocused();
      await expect(page.getByRole("log")).toContainText(
        "Private reply for " + first,
      );
      await expect(page.getByText("Connected", { exact: true })).toBeVisible();
      await info.attach(`inbox-chat-${tutor ? "tutor" : "learner"}-${width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      expect(
        await page.evaluate(() => Reflect.get(window, "inboxDocument")),
      ).toBe("same-document");
      await expect(navigation).toBeVisible();
      const chatAxe = await new AxeBuilder({ page })
        .include(".messaging-inbox")
        .analyze();
      expect(chatAxe.violations).toEqual([]);
      expect(fixtures.disclosures()).toBe(0);
      await expect(page.getByText("peer@example.test")).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("log")).toContainText(first);
      await expect(navigation).toBeVisible();
      if (width === 1440) {
        await expect(
          page.getByRole("link", { name: /Physics conversation/ }),
        ).toContainText("0 unread messages");
        for (const id of [second, first, second]) {
          await page
            .getByRole("link", {
              name:
                id === first ? /Physics conversation/ : /Guitar conversation/,
            })
            .click();
          await expect(page.getByRole("log")).toContainText(id);
        }
        expect(
          await page.evaluate(() => Reflect.get(window, "inboxStreams")),
        ).toEqual({ active: 1, maximum: 1 });
        await page.goBack();
        await expect(page.getByRole("log")).toContainText(first);
      }
      await page.getByRole("link", { name: "Details", exact: true }).click();
      await expect(
        page.getByText("Fictional private learning goals"),
      ).toBeVisible();
      expect(fixtures.disclosures()).toBe(0);
      await page
        .getByRole("button", { name: "Show verified contact", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: "peer@example.test", exact: true }),
      ).toBeVisible();
      expect(fixtures.disclosures()).toBe(1);
      await page
        .getByRole("link", { name: "Classes & Google Meet", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Classes & Google Meet",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText("peer@example.test")).toHaveCount(0);
      await expect(
        page.getByRole("link", {
          name: "Report or block this account",
          exact: true,
        }),
      ).toBeVisible();
      const axe = await new AxeBuilder({ page })
        .include(".messaging-inbox")
        .analyze();
      expect(axe.violations).toEqual([]);
      await info.attach(`inbox-${tutor ? "tutor" : "learner"}-${width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await page
        .getByRole("link", { name: "Back to conversations", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: /Physics conversation/ }),
      ).toBeFocused();
      await page
        .getByRole("link", { name: /Unavailable conversation/ })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        "This Connection is restricted.",
      );
      await expect(page.getByRole("log")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Show verified contact",
          exact: true,
        }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => Reflect.get(window, "inboxStreams").active),
      ).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      for (const [path, section] of [
        ["/chat/" + first, "messages"],
        ["/connections/" + first, "details"],
        ["/connections/" + first + "#classes", "classes"],
      ]) {
        await page.goto(path);
        await expect(page).toHaveURL(
          new RegExp("/connections\\?conversation=" + first),
        );
        await expect(
          page
            .getByRole("navigation", { name: "Conversation sections" })
            .getByRole("link", {
              name:
                section === "messages"
                  ? "Messages"
                  : section === "details"
                    ? "Details"
                    : "Classes & Google Meet",
              exact: true,
            }),
        ).toHaveAttribute("aria-current", "page", { timeout: 30000 });
      }
      await page.route("**/v1/me/connections", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ connections: [], next_cursor: null }),
        }),
      );
      await page.goto("/connections");
      const emptySearch =
        width === 390
          ? page.getByRole("complementary", { name: "Conversations" })
          : page.getByRole("region", { name: "Messages" });
      await expect(
        emptySearch.getByRole("link", {
          name: "Search for a teacher",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        emptySearch.getByRole("link", {
          name: "Search for a teacher",
          exact: true,
        }),
      ).toHaveAttribute("href", "/tutors");
    });
