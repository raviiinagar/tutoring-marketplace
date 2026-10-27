import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type ClassInvitations as ClassState } from "@/lib/api";
import { AuthShell } from "@/components/account/ui";
import { ClassInvitations } from "@/components/class-invitations";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
let state: ClassState;
const item = {
  id: "class-one",
  title: "Fictional Physics class",
  starts_at: "2026-10-28T12:00:00.000Z",
  ends_at: "2026-10-28T13:00:00.000Z",
  duration_minutes: 60,
  status: "SCHEDULED" as const,
  revision: 1,
  updated_at: "2026-10-27T12:00:00.000Z",
  can_join: false,
  meet_url: "https://meet.google.com/abc-defg-hij",
};
const publicItem = { ...item, meet_url: null };
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthShell title="Connection">
        <ClassInvitations connectionId="connection-one" />
      </AuthShell>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  state = { viewer_role: "TUTOR", server_time: "2026-10-27T12:00:00.000Z", classes: [] };
  vi.spyOn(api, "classes").mockImplementation(async () => ({
    ok: true,
    status: 200,
    data: structuredClone(state),
  }));
  vi.spyOn(api, "me").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in." },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("saves an IST class and shows the server-saved card", async () => {
  const create = vi.spyOn(api, "createClass").mockImplementation(async (_id, details) => {
    state.classes = [{ ...item, ...details, starts_at: details.starts_at }];
    return { ok: true, status: 201, data: { class: state.classes[0]!, replayed: false } };
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Schedule class" }));
  fireEvent.change(screen.getByLabelText("Class title"), {
    target: { value: "Fictional Physics class" },
  });
  fireEvent.change(screen.getByLabelText("Class date and time (IST)"), {
    target: { value: "2026-10-28T17:30" },
  });
  fireEvent.change(screen.getByLabelText("Google Meet link"), { target: { value: item.meet_url } });
  fireEvent.click(screen.getByRole("button", { name: "Save scheduled class" }));
  expect(await screen.findByText("Saved · Scheduled")).toBeVisible();
  expect(create).toHaveBeenCalledWith(
    "connection-one",
    expect.objectContaining({
      starts_at: "2026-10-28T12:00:00.000Z",
      meet_url: item.meet_url,
      duration_minutes: 60,
    }),
    expect.any(String),
  );
  expect(screen.getByRole("button", { name: "Join class" })).toBeDisabled();
});
it("gives Learners a join action without Tutor editing controls and rechecks permission on click", async () => {
  state = {
    ...state,
    viewer_role: "PAYER",
    classes: [{ ...publicItem, can_join: true }],
  };
  vi.spyOn(window, "open").mockReturnValue(null);
  const join = vi.spyOn(api, "joinClass").mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 403,
      code: "CONNECTION_RESTRICTED",
      message: "This Connection is restricted.",
    },
  });
  mount();
  const button = await screen.findByRole("button", { name: "Join class" });
  expect(button).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Schedule class" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel class" })).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(await screen.findByText("This Connection is restricted.")).toBeVisible();
  expect(join).toHaveBeenCalledWith("connection-one", "class-one");
  expect(screen.queryByRole("link", { name: /Open Google Meet/ })).not.toBeInTheDocument();
});
it("cancels the current revision and removes Join from its saved card", async () => {
  state.classes = [{ ...item, can_join: true }];
  const cancel = vi.spyOn(api, "cancelClass").mockImplementation(async () => {
    state.classes = [{ ...item, status: "CANCELLED", revision: 2, can_join: false }];
    return { ok: true, status: 200, data: { class: state.classes[0]! } };
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Cancel class" }));
  expect(await screen.findByText("Cancelled", { exact: true })).toBeVisible();
  expect(cancel).toHaveBeenCalledWith("connection-one", "class-one", 1);
  expect(screen.queryByRole("button", { name: "Join class" })).not.toBeInTheDocument();
});
it("shows a verified link only after Join authorization when the browser blocks a popup", async () => {
  state = {
    ...state,
    viewer_role: "PAYER",
    classes: [{ ...publicItem, can_join: true }],
  };
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.spyOn(api, "joinClass").mockResolvedValue({
    ok: true,
    status: 200,
    data: { url: item.meet_url },
  });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Join class" }));
  const link = await screen.findByRole("link", { name: "Popup blocked? Open Google Meet" });
  expect(link).toHaveAttribute("href", item.meet_url);
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  state.classes = [{ ...item, status: "CANCELLED", revision: 2, can_join: false }];
  fireEvent.click(screen.getByRole("button", { name: "Refresh class status" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "Popup blocked? Open Google Meet" }),
    ).not.toBeInTheDocument(),
  );
});
