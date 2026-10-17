import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SupportDesk, SupportOperations } from "@/components/support";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const policy = {
  hours: "Monday-Saturday, 10:00-18:00 IST",
  timezone: "Asia/Kolkata",
  open_now: false,
  next_opening_at: "2026-10-19T04:30:00.000Z",
  notice: "Cases are accepted outside support hours.",
};
const row = {
  id: "case-one",
  category: "ACCOUNT",
  status: "OPEN",
  revision: 1,
  assigned: false,
  required_scope: "SUPPORT",
  subject: "Help with sessions",
  description: "Please help me revoke my lost device session.",
  events: [],
  created_at: "2026-10-17T10:00:00Z",
};
it("creates a case with a stable retry key and shows published hours and tracked status", async () => {
  let sent: any;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "POST") {
      sent = JSON.parse(String(init.body));
      return Response.json({ case: row });
    }
    return Response.json({ cases: [], policy });
  });
  render(<SupportDesk />);
  expect(await screen.findByText(policy.hours)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Help with sessions" } });
  fireEvent.change(screen.getByLabelText("Describe the issue"), {
    target: { value: row.description },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create support case" }));
  await waitFor(() => expect(sent?.request_key).toBeTruthy());
  expect(sent.category).toBe("ACCOUNT");
  expect(await screen.findByText("Help with sessions")).toBeTruthy();
  expect(screen.getByText("Status: OPEN")).toBeTruthy();
});
it("staff must choose a scoped queue and enter a purpose before inspecting private case text", async () => {
  const writes: any[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/v1/staff/access"))
      return Response.json({ scopes: ["TRUST"], authenticated: true });
    if (String(url).includes("/inspections"))
      return Response.json({
        case: {
          ...row,
          category: "REVIEW_APPEAL",
          required_scope: "TRUST",
          source_id: "appeal-one",
          related_id: "review-one",
          source_revision: 2,
        },
      });
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return Response.json({
        case: {
          ...row,
          status: "IN_PROGRESS",
          revision: 2,
          assigned: true,
          assigned_to: "operator",
        },
      });
    }
    return Response.json({
      cases: [{ ...row, category: "REVIEW_APPEAL", required_scope: "TRUST" }],
    });
  });
  render(<SupportOperations />);
  const queue = await screen.findByRole("button", { name: "Load case queue" });
  expect((queue as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("option", { name: "FINANCE" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Reason for case access"), {
    target: { value: "Investigate fictional moderation appeal" },
  });
  fireEvent.click(queue);
  expect(screen.queryByText(row.description)).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect case case-one" }));
  expect(await screen.findByText(row.description)).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Resolve support question" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Claim case" }));
  await waitFor(() => expect(writes[0]?.operation).toBe("CLAIM"));
  expect(writes[0]?.revision).toBe(1);
});

it("clears previously opened private support content when the session no longer authorizes reads", async () => {
  let expired = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (expired)
      return Response.json(
        { code: "UNAUTHENTICATED", message: "Please sign in." },
        { status: 401 },
      );
    return Response.json(
      String(url).endsWith("/case-one") ? { case: row } : { cases: [row], policy },
    );
  });
  render(<SupportDesk />);
  fireEvent.click(await screen.findByRole("button", { name: "Open case case-one" }));
  expect(await screen.findByText(row.description)).toBeTruthy();
  expired = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh cases" }));
  await screen.findByText("Please sign in.");
  expect(screen.queryByText(row.description)).toBeNull();
  expect(screen.queryByRole("button", { name: "Open case case-one" })).toBeNull();
});

it("publishes human support hours even when the visitor is signed out", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("/v1/support-policy")
      ? Response.json(policy)
      : Response.json({ code: "UNAUTHENTICATED", message: "Please sign in." }, { status: 401 }),
  );
  render(<SupportDesk />);
  expect(await screen.findByText(policy.hours)).toBeTruthy();
  expect(screen.getByText(/Outside support hours/)).toBeTruthy();
});
