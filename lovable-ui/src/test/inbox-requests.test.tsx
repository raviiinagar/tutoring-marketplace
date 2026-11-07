import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InboxRequests } from "@/components/inbox-requests";
import { api, type ContactRequest, type IncomingRequest } from "@/lib/api";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
const request = (changes: Partial<IncomingRequest> = {}): IncomingRequest => ({
  id: "fictional-request",
  server_time: "2026-11-07T00:00:00Z",
  expires_at: "2026-11-07T01:00:00Z",
  created_at: "2026-11-06T00:00:00Z",
  reminder: "DUE_SOON",
  offer: {
    title: "Physics enquiry",
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
  status: "PENDING",
  learning_requirements: "Practice momentum with examples",
  preferred_times: "Tuesday evenings",
  can_accept: true,
  can_decline: true,
  unavailable_reason: null,
  connection_id: null,
  test_only: true,
  ...changes,
});
const sent = (changes: Partial<ContactRequest> = {}): ContactRequest => ({
  ...request(),
  listing_id: "fictional-listing",
  learner_id: "fictional-child",
  learner_alias: "Young learner",
  learner_usable: true,
  request_policy_version: "contact-v1",
  ...changes,
});
const response = (requests: IncomingRequest[]) => ({
  ok: true as const,
  status: 200,
  data: { requests, next_cursor: null },
});
const accepted = vi.fn();
beforeEach(() => {
  vi.spyOn(api, "tutorRequests").mockResolvedValue(response([request()]));
  vi.spyOn(api, "contactRequests").mockResolvedValue({
    ok: true,
    status: 200,
    data: { requests: [sent()], next_cursor: null },
  });
  vi.spyOn(api, "decideRequest");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  accepted.mockReset();
  navigate.mockReset();
});
async function open(tutor = true) {
  const view = render(<InboxRequests tutor={tutor} onAccepted={accepted} />);
  await screen.findByRole("heading", { name: "Physics enquiry", hidden: true });
  // jsdom does not implement the native summary toggle, so open it explicitly.
  view.container.querySelector("details")!.open = true;
  return view;
}
it("separates requests from chat and offers only server-allowed Tutor decisions", async () => {
  vi.mocked(api.tutorRequests).mockResolvedValue(
    response([request({ can_accept: false, unavailable_reason: "LISTING_UNAVAILABLE" })]),
  );
  await open();
  expect(screen.getByRole("region", { name: "Incoming requests" })).toBeVisible();
  expect(
    screen.getByText(/A pending request does not open a chat or share contacts/),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Accept enquiry" })).toBeNull();
  expect(screen.getByRole("button", { name: "Decline enquiry" })).toBeEnabled();
  expect(screen.queryByRole("link", { name: "Open conversation" })).toBeNull();
  expect(screen.queryByRole("log")).toBeNull();
  expect(api.contactRequests).not.toHaveBeenCalled();
});
it("uses the returned Connection ID after acceptance and never the request ID", async () => {
  vi.mocked(api.decideRequest).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      request_id: "fictional-request",
      status: "ACCEPTED",
      connection_id: "new-connection",
      connection_status: "ACTIVE",
      replayed: false,
    },
  });
  await open();
  expect(accepted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Accept enquiry" }));
  await waitFor(() => expect(accepted).toHaveBeenCalledExactlyOnceWith("new-connection"));
  expect(api.decideRequest).toHaveBeenCalledExactlyOnceWith("fictional-request", "ACCEPT");
});
it("declines without opening chat and refreshes the authoritative status", async () => {
  vi.mocked(api.decideRequest).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      request_id: "fictional-request",
      status: "DECLINED",
      connection_id: null,
      connection_status: null,
      replayed: false,
    },
  });
  await open();
  vi.mocked(api.tutorRequests).mockResolvedValue(
    response([request({ status: "DECLINED", can_accept: false, can_decline: false })]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Decline enquiry" }));
  expect(await screen.findByText("Status: DECLINED")).toBeVisible();
  expect(await screen.findByText("Enquiry declined.")).toBeVisible();
  expect(screen.getByText("Requests", { exact: true })).toHaveFocus();
  expect(accepted).not.toHaveBeenCalled();
});
it("refreshes a stale decision without claiming success or creating a conversation", async () => {
  vi.mocked(api.decideRequest).mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 409,
      code: "REQUEST_EXPIRED",
      message: "The request has expired.",
    },
  });
  await open();
  vi.mocked(api.tutorRequests).mockResolvedValue(
    response([request({ status: "EXPIRED", can_accept: false, can_decline: false })]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept enquiry" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The request has expired.");
  expect(screen.getByText("Status: EXPIRED")).toBeVisible();
  await waitFor(() => expect(api.tutorRequests).toHaveBeenCalledTimes(2));
  expect(accepted).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Accept enquiry" })).toBeNull();
});
it("treats equality as expired using server_time even when the server flags are stale", async () => {
  vi.mocked(api.tutorRequests).mockResolvedValue(
    response([request({ expires_at: "2026-11-07T00:00:00Z" })]),
  );
  await open();
  expect(screen.getByText("Status: EXPIRED")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Accept enquiry" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline enquiry" })).toBeNull();
  expect(api.decideRequest).not.toHaveBeenCalled();
});
it("shows sent status and only the usable learner alias, with no Tutor action", async () => {
  const view = await open(false);
  expect(screen.getByRole("region", { name: "Sent requests" })).toHaveTextContent(
    "Learner: Young learner",
  );
  expect(screen.getByText("Status: PENDING")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Accept enquiry" })).toBeNull();
  expect(api.tutorRequests).not.toHaveBeenCalled();
  vi.mocked(api.contactRequests).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      requests: [sent({ learner_usable: false, learner_alias: "Must remain private" })],
      next_cursor: null,
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh requests" }));
  await screen.findByText(/The Learner profile is unavailable/);
  expect(view.container).not.toHaveTextContent("Must remain private");
  expect(view.container).not.toHaveTextContent("Practice momentum with examples");
});
it("distinguishes errors from empty results and recovers through refresh", async () => {
  vi.mocked(api.tutorRequests).mockResolvedValue({ ok: false, error: { kind: "unavailable" } });
  const view = render(<InboxRequests tutor onAccepted={accepted} />);
  view.container.querySelector("details")!.open = true;
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.queryByText("No incoming requests yet.")).toBeNull();
  vi.mocked(api.tutorRequests).mockResolvedValue(response([]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh requests" }));
  expect(await screen.findByText("No incoming requests yet.")).toBeVisible();
  expect(screen.getByText("Requests", { exact: true })).toBeVisible();
});
it("paginates with the server cursor and labels the count as page-local", async () => {
  vi.mocked(api.tutorRequests).mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: { requests: [request()], next_cursor: "server-cursor" },
  });
  await open();
  expect(screen.getByText("Requests (1 pending)")).toBeVisible();
  expect(screen.getByText("Pending counts cover only the loaded page.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next requests" }));
  await waitFor(() => expect(api.tutorRequests).toHaveBeenLastCalledWith("server-cursor"));
  fireEvent.click(await screen.findByRole("button", { name: "First requests" }));
  await waitFor(() => expect(api.tutorRequests).toHaveBeenLastCalledWith(undefined));
});
it("ignores a late acceptance after leaving the inbox", async () => {
  let finish!: (value: Awaited<ReturnType<typeof api.decideRequest>>) => void;
  vi.mocked(api.decideRequest).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = await open();
  fireEvent.click(screen.getByRole("button", { name: "Accept enquiry" }));
  view.unmount();
  await act(async () =>
    finish({
      ok: true,
      status: 200,
      data: {
        request_id: "fictional-request",
        status: "ACCEPTED",
        connection_id: "late-connection",
        connection_status: "ACTIVE",
        replayed: false,
      },
    }),
  );
  expect(accepted).not.toHaveBeenCalled();
  expect(api.tutorRequests).toHaveBeenCalledTimes(1);
});

for (const capability of ["can_accept", "can_decline"] as const)
  it(`opens an actionable request by default for ${capability} without stealing focus`, async () => {
    vi.mocked(api.tutorRequests).mockResolvedValue(
      response([request({ can_accept: false, can_decline: false, [capability]: true })]),
    );
    const view = render(
      <>
        <button>Keep focus</button>
        <InboxRequests tutor onAccepted={accepted} />
      </>,
    );
    const button = screen.getByRole("button", { name: "Keep focus" });
    button.focus();
    await screen.findByText("Requests (1 pending)");
    expect(view.container.querySelector("details")).toHaveAttribute("open");
    expect(button).toHaveFocus();
  });

for (const changes of [
  { can_accept: false, can_decline: false },
  { status: "ACCEPTED" as const },
  { expires_at: "2026-11-07T00:00:00Z" },
])
  it(`defaults to collapsed with no count for non-actionable ${JSON.stringify(changes)}`, async () => {
    vi.mocked(api.tutorRequests).mockResolvedValue(response([request(changes)]));
    const view = render(<InboxRequests tutor onAccepted={accepted} />);
    await screen.findByRole("heading", { name: "Physics enquiry", hidden: true });
    expect(view.container.querySelector("summary")).toHaveTextContent(/^Requests$/);
    expect(view.container.querySelector("details")).not.toHaveAttribute("open");
  });

it("counts only actionable pending requests and stops counting at the server deadline", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  vi.mocked(api.tutorRequests).mockResolvedValue(
    response([
      request({ id: "accept", expires_at: "2026-11-07T00:00:01Z" }),
      request({ id: "decline", can_accept: false }),
      request({ id: "closed", status: "DECLINED" }),
      request({ id: "denied", can_accept: false, can_decline: false }),
    ]),
  );
  await act(async () => {
    render(<InboxRequests tutor onAccepted={accepted} />);
  });
  expect(screen.getByText("Requests (2 pending)")).toBeVisible();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("Requests (1 pending)")).toBeVisible();
});
