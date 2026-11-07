import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Connections } from "@/routes/connections";
import type { InboxView } from "@/routes/connections";
import * as client from "@/lib/api";
import { api, type ChatState, type ConnectionSummary } from "@/lib/api";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  createFileRoute: () => (options: unknown) => options,
  Link: ({
    to,
    params,
    search,
    resetScroll: _scroll,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
    resetScroll?: boolean;
    children: React.ReactNode;
  }) => {
    const path = to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? "");
    const query = new URLSearchParams(
      Object.entries(search ?? {}).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    return (
      <a
        {...props}
        href={path + (query.size ? "?" + query : "")}
        onClick={(event) => {
          event.preventDefault();
          navigate({ to, search });
        }}
      >
        {children}
      </a>
    );
  },
}));
vi.mock("@/components/account/ui", async () => ({
  ...(await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui")),
  AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <nav aria-label="Workspace navigation">Dashboard / My messages / My Account</nav>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
const row = (id: string, available = true): ConnectionSummary => ({
  id,
  request_id: "request-" + id,
  listing_id: "listing-" + id,
  offer: {
    title: "Physics " + id,
    description: "Fictional class",
    domain_id: "school",
    subject_id: "subject-physics",
    level_id: "level-class-10",
    curriculum_id: "curriculum-cbse",
    language_ids: ["language-english"],
    teaching_mode: "ONLINE",
    rate_paise: 50000,
    rate_unit: "HOUR",
    currency: "INR",
    trial_kind: "NONE",
  },
  status: "ACTIVE",
  available,
  unread_count: available ? 1 : null,
  unavailable_reason: available ? null : "CONNECTION_RESTRICTED",
  created_at: "2026-11-07T00:00:00Z",
  test_only: true,
});
const frame = (id: string): ChatState => ({
  connection_id: id,
  conversation_id: "conversation-" + id,
  offer_title: "Physics " + id,
  your_role: "PAYER",
  learner_kind: "ADULT",
  messages: [
    {
      sequence: 1,
      client_message_id: "message-" + id,
      text: "Reply for " + id,
      sender_role: "TUTOR",
      your_message: false,
      created_at: "2026-11-07T00:00:00Z",
    },
  ],
  last_sequence: 1,
  next_after: 1,
  has_more: false,
  has_older: false,
  read_sequence: 0,
  peer_read_sequence: 0,
  unread_count: 1,
});
let active: Set<string>, maximum: number;
function Harness({ initial }: { initial?: { conversation?: string; view?: InboxView } }) {
  const [selection, setSelection] = useState(initial ?? {});
  navigate.mockImplementation(({ search }: { search?: typeof selection }) =>
    setSelection(search ?? {}),
  );
  return <Connections {...selection} />;
}
beforeEach(() => {
  vi.spyOn(api, "contactRequests").mockResolvedValue({
    ok: true,
    status: 200,
    data: { requests: [], next_cursor: null },
  });
  active = new Set();
  maximum = 0;
  vi.spyOn(api, "connections").mockResolvedValue({
    ok: true,
    status: 200,
    data: { connections: [row("one"), row("two"), row("held", false)], next_cursor: null },
  });
  vi.spyOn(api, "chatHistory").mockImplementation(async (id) => ({
    ok: true,
    status: 200,
    data: frame(id),
  }));
  vi.spyOn(api, "readChat").mockResolvedValue({
    ok: true,
    status: 200,
    data: { read_sequence: 1, peer_read_sequence: 0, unread_count: 0 },
  });
  vi.spyOn(client, "subscribeChat").mockImplementation((id) => {
    active.add(id);
    maximum = Math.max(maximum, active.size);
    return () => {
      active.delete(id);
    };
  });
  vi.spyOn(api, "connection").mockImplementation(async (id) =>
    id === "held"
      ? {
          ok: false,
          error: {
            kind: "http",
            status: 403,
            code: "CONNECTION_RESTRICTED",
            message: "This Connection is restricted.",
          },
        }
      : {
          ok: true,
          status: 200,
          data: {
            connection: {
              ...row(id),
              status: "ACTIVE",
              your_role: "PAYER",
              learner_kind: "ADULT",
              learning_requirements: "Private learning goals",
              preferred_times: "Tuesday evenings",
            },
          },
        },
  );
  vi.spyOn(api, "connectionContacts").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      peer: {
        display_name: "Fictional Tutor",
        email: "tutor@example.test",
        email_verified: true,
        role: "TUTOR",
      },
    },
  });
  vi.spyOn(api, "classes").mockResolvedValue({
    ok: true,
    status: 200,
    data: { viewer_role: "PAYER", server_time: "2026-11-07T00:00:00Z", classes: [] },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockReset();
});

it("selects a conversation inside the inbox, clears server-confirmed unread counts and keeps one stream across switches", async () => {
  render(<Harness />);
  const sidebar = await screen.findByRole("complementary", { name: "Conversations" });
  const one = await within(sidebar).findByRole("link", { name: /Physics one/ });
  expect(one).toHaveTextContent("1 unread messages");
  fireEvent.click(one);
  expect(await screen.findByRole("log")).toHaveTextContent("Reply for one");
  await waitFor(() => expect(one).toHaveTextContent("0 unread messages"));
  expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Selected conversation" })).toHaveFocus();
  for (const id of ["two", "one", "two"]) {
    fireEvent.click(within(sidebar).getByRole("link", { name: new RegExp("Physics " + id) }));
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Reply for " + id));
    await waitFor(() => expect(active).toEqual(new Set([id])));
    expect(screen.getByRole("log")).not.toHaveTextContent(
      "Reply for " + (id === "one" ? "two" : "one"),
    );
  }
  expect(maximum).toBe(1);
  fireEvent.click(screen.getByRole("link", { name: "Back to conversations" }));
  expect(screen.queryByRole("log")).toBeNull();
  expect(active.size).toBe(0);
  expect(within(sidebar).getByRole("link", { name: /Physics two/ })).toHaveFocus();
});
it("opens a deep selection, retains composer constraints, and returns to list for the mobile layout", async () => {
  const { container } = render(<Harness initial={{ conversation: "two" }} />);
  expect(await screen.findByRole("log")).toHaveTextContent("Reply for two");
  expect(screen.getByLabelText("Message")).toHaveAttribute("maxlength", "2000");
  expect(screen.getByText(/Shift \+ Enter for a new line/)).toBeVisible();
  expect(screen.getByText(/Adult participants only/)).toHaveTextContent("Text messages only.");
  expect(container.querySelector("[data-selected=true]")).not.toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Back to conversations" }));
  expect(await screen.findByRole("heading", { name: "Your conversations" })).toBeVisible();
  expect(container.querySelector("[data-selected=false]")).not.toBeNull();
});
it("shows unavailable Connection reasons and server denial in the pane without starting chat or disclosing contacts", async () => {
  render(<Harness initial={{ conversation: "held" }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("This Connection is restricted.");
  expect(screen.getByRole("heading", { name: "Connection access" })).toBeVisible();
  expect(screen.queryByRole("log")).toBeNull();
  expect(screen.queryByRole("button", { name: "Show verified contact" })).toBeNull();
  await waitFor(() => expect(active.size).toBe(0));
  expect(api.connectionContacts).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Report or block this account" })).toBeVisible();
});
it("keeps Details and Classes inside the pane and reveals verified email only on the explicit action", async () => {
  render(<Harness initial={{ conversation: "one" }} />);
  await screen.findByRole("log");
  fireEvent.click(screen.getByRole("link", { name: "Details" }));
  expect(await screen.findByText("Private learning goals")).toBeVisible();
  expect(active.size).toBe(0);
  expect(screen.queryByText("tutor@example.test")).toBeNull();
  expect(api.connectionContacts).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show verified contact" }));
  expect(await screen.findByRole("link", { name: "tutor@example.test" })).toBeVisible();
  fireEvent(window, new Event("blur"));
  expect(screen.queryByText("tutor@example.test")).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Classes & Google Meet" }));
  expect(await screen.findByRole("heading", { name: "Classes & Google Meet" })).toBeVisible();
  expect(api.classes).toHaveBeenCalledWith("one");
  expect(screen.queryByText("tutor@example.test")).toBeNull();
});
it("clears chat and its draft when the existing stream revokes access", async () => {
  let revoke!: (denied: boolean) => void;
  vi.mocked(client.subscribeChat).mockImplementation((_id, _after, _state, callback) => {
    revoke = callback;
    return vi.fn();
  });
  render(<Harness initial={{ conversation: "one" }} />);
  await screen.findByRole("log");
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Unsent private draft" } });
  await act(async () => revoke(true));
  expect(screen.queryByRole("log")).toBeNull();
  expect(screen.queryByLabelText("Message")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Chat access is unavailable");
  expect(screen.queryByText("Reply for one")).toBeNull();
});
it("does not clear unread merely from fetching history, and ignores an older list response after a confirmed read", async () => {
  let finishRead!: (result: Awaited<ReturnType<typeof api.readChat>>) => void;
  let finishList!: (result: Awaited<ReturnType<typeof api.connections>>) => void;
  vi.mocked(api.readChat).mockReturnValue(
    new Promise((done) => {
      finishRead = done;
    }),
  );
  vi.mocked(api.connections).mockImplementation(
    () =>
      new Promise((done) => {
        finishList = done;
      }),
  );
  render(<Harness initial={{ conversation: "one" }} />);
  await screen.findByRole("log");
  await waitFor(() => expect(api.readChat).toHaveBeenCalledWith("one", 1));
  await act(async () =>
    finishList({ ok: true, status: 200, data: { connections: [row("one")], next_cursor: null } }),
  );
  const link = await screen.findByRole("link", { name: /Physics one/ });
  expect(link).toHaveTextContent("1 unread messages");
  // Simulate a list refresh sent before the read confirmation arrives.
  fireEvent.click(screen.getByRole("button", { name: "Refresh Connections" }));
  await act(async () =>
    finishRead({
      ok: true,
      status: 200,
      data: { read_sequence: 1, peer_read_sequence: 0, unread_count: 0 },
    }),
  );
  await waitFor(() => expect(link).toHaveTextContent("0 unread messages"));
  await act(async () =>
    finishList({ ok: true, status: 200, data: { connections: [row("one")], next_cursor: null } }),
  );
  expect(link).toHaveTextContent("0 unread messages");
});
it("does not render late messages from a previously selected conversation", async () => {
  let oldFrame!: (state: ChatState) => void;
  vi.mocked(client.subscribeChat).mockImplementation((id, _after, accept) => {
    if (id === "one") oldFrame = accept;
    return vi.fn();
  });
  render(<Harness initial={{ conversation: "one" }} />);
  await screen.findByRole("log");
  await waitFor(() => expect(oldFrame).toBeTypeOf("function"));
  fireEvent.click(await screen.findByRole("link", { name: /Physics two/ }));
  await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("Reply for two"));
  await act(async () =>
    oldFrame({
      ...frame("one"),
      messages: [{ ...frame("one").messages[0]!, text: "Late private reply" }],
    }),
  );
  expect(screen.getByRole("log")).not.toHaveTextContent("Late private reply");
});
it("does not restore unread from a delayed pre-read SSE frame", async () => {
  let incoming!: (state: ChatState) => void;
  vi.mocked(client.subscribeChat).mockImplementation((_id, _after, accept) => {
    incoming = accept;
    return vi.fn();
  });
  render(<Harness initial={{ conversation: "one" }} />);
  await screen.findByRole("log");
  const link = await screen.findByRole("link", { name: /Physics one/ });
  await waitFor(() => expect(link).toHaveTextContent("0 unread messages"));
  await act(async () => incoming(frame("one")));
  expect(link).toHaveTextContent("0 unread messages");
});
it("preserves Shift+Enter and retries an unknown send outcome with the same message identity", async () => {
  const send = vi
    .spyOn(api, "sendMessage")
    .mockResolvedValueOnce({ ok: false, error: { kind: "unavailable" } })
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: {
        message: {
          ...frame("one").messages[0]!,
          sequence: 2,
          text: "Explain momentum",
          sender_role: "PAYER",
          your_message: true,
        },
        replayed: true,
      },
    });
  render(<Harness initial={{ conversation: "one" }} />);
  await screen.findByRole("log");
  const composer = screen.getByLabelText("Message");
  fireEvent.change(composer, { target: { value: "Explain momentum" } });
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(composer, { key: "Enter" });
  fireEvent.click(await screen.findByRole("button", { name: "Retry message" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(send.mock.calls[0]).toEqual(["one", expect.any(String), "Explain momentum"]);
  await waitFor(() => expect(composer).toHaveValue(""));
});
