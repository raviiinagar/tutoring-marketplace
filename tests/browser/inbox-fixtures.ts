import type { Page } from "@playwright/test";
export const first = "00000000-0000-4000-8000-000000000001",
  second = "00000000-0000-4000-8000-000000000002",
  held = "00000000-0000-4000-8000-000000000003";
export async function inboxFixtures(
  page: Page,
  tutor: boolean,
  options: { messageCount?: number; title?: string; unbroken?: boolean } = {},
) {
  const count = options.messageCount ?? 1;
  const rows = [first, second, held].map((id, index) => ({
    id,
    request_id: "request-" + id,
    listing_id: "listing-" + id,
    offer: {
      title:
        index === 0 && options.title
          ? options.title
          : [
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
    messages: Array.from({ length: count }, (_, index) => ({
      sequence: index + 1,
      client_message_id: "message-" + id + "-" + index,
      text:
        "Private reply for " +
        id +
        ". " +
        (options.unbroken && index === count - 1
          ? "W".repeat(350)
          : "Let us work through a practical example together and discuss the learning goals for our next class."),
      sender_role: tutor ? "PAYER" : "TUTOR",
      your_message: false,
      created_at: "2026-11-07T00:00:00Z",
    })),
    last_sequence: count,
    next_after: count,
    has_more: false,
    has_older: false,
    read_sequence: reads.get(id) ?? 0,
    peer_read_sequence: 0,
    unread_count: reads.get(id) ? 0 : count,
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
        reads.set(id, count);
        body = { read_sequence: count, peer_read_sequence: 0, unread_count: 0 };
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
