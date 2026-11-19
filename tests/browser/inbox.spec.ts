import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { first, second, inboxFixtures } from "./inbox-fixtures";
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
        // The link sits in the Enquiries tab, so it is counted even while Chats is shown.
        page.getByRole("link", {
          name: "Enquiries from learners",
          exact: true,
          includeHidden: true,
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
      await page.getByRole("link", { name: "Classes", exact: true }).click();
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
      // The back control is shown on phones; on wider screens the list stays beside the chat,
      // so the same link is activated directly there to check focus returns to the list.
      const back = page.getByRole("link", {
        name: "Back to conversations",
        exact: true,
        includeHidden: true,
      });
      if (width === 390) await back.click();
      else
        await back.evaluate((element) =>
          (element as HTMLAnchorElement).click(),
        );
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
                  ? "Chat"
                  : section === "details"
                    ? "Details"
                    : "Classes",
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
      // Learners are pointed to search; the Tutor inbox leaves it out (da5676c).
      const search = emptySearch.getByRole("link", {
        name: "Search for a teacher",
        exact: true,
      });
      if (tutor) await expect(search).toHaveCount(0);
      else {
        await expect(search).toBeVisible();
        await expect(search).toHaveAttribute("href", "/tutors");
      }
    });
