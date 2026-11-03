import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearnerDashboard } from "@/components/learner-dashboard";
import { AccountSettings } from "@/components/account-settings";
import { api, type User, type ContactRequest } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/account/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui");
  return {
    ...actual,
    AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    ),
  };
});
const user: User = {
  id: "first-account",
  display_name: "Fictional Learner",
  email: "learner@example.invalid",
  email_verified: true,
  roles: ["LEARNER"],
  created_at: "2026-11-03",
};
const clients: QueryClient[] = [];
function mount(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.spyOn(api, "me").mockResolvedValue({ ok: true, status: 200, data: { user } });
  vi.spyOn(api, "contactRequests").mockResolvedValue({
    ok: true,
    status: 200,
    data: { requests: [], next_cursor: null },
  });
  vi.spyOn(api, "connections").mockResolvedValue({
    ok: true,
    status: 200,
    data: { connections: [], next_cursor: null },
  });
  vi.spyOn(api, "savedTutors").mockResolvedValue({
    ok: true,
    status: 200,
    data: { items: [], limit: 50 },
  });
  vi.spyOn(api, "learners").mockResolvedValue({ ok: true, status: 200, data: { profiles: [] } });
  vi.spyOn(api, "requestAccess").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      can_request: false,
      pending_count: 3,
      pending_limit: 5,
      request_policy_version: "contact-v1",
      request_ttl_hours: 72,
      checkout_available: false,
      reason: "ACCESS_REQUIRED",
      coverage: null,
    },
  });
  vi.spyOn(api, "sessions").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      sessions: [
        {
          id: "session-current",
          current: true,
          created_at: "2026-11-03T00:00:00Z",
          expires_at: "2026-11-04T00:00:00Z",
        },
      ],
    },
  });
  vi.spyOn(api, "staffAccess").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 403, code: "FORBIDDEN", message: "Not staff" },
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  navigate.mockReset();
});
it("shows actual access and honest empty learning states without invented phone verification or booking totals", async () => {
  mount(<LearnerDashboard />);
  await screen.findByText("Your first enquiry starts with a Tutor");
  expect(screen.getByText("Email verified")).toBeTruthy();
  expect(screen.getByText(/of 5 pending enquiries/).textContent).toContain("3");
  expect(screen.getByText(/No current Access Pass/)).toBeTruthy();
  expect(screen.queryByText(/Phone verified|Completed lessons/)).toBeNull();
  expect(screen.getByRole("link", { name: /Manage your account/ }).getAttribute("href")).toBe(
    "/account/settings",
  );
});
it("renders a failed section as a retry rather than an empty count", async () => {
  vi.mocked(api.contactRequests).mockResolvedValueOnce({
    ok: false,
    error: { kind: "unavailable" },
  });
  mount(<LearnerDashboard />);
  await screen.findByText("Enquiries could not be loaded.");
  expect(screen.queryByText("Your first enquiry starts with a Tutor")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry enquiries" }));
  await screen.findByText("Your first enquiry starts with a Tutor");
});
it("does not leak a late private result after switching accounts", async () => {
  let finish!: (result: Awaited<ReturnType<typeof api.contactRequests>>) => void;
  vi.mocked(api.contactRequests).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = mount(<LearnerDashboard />);
  await screen.findByText("Hello, Fictional Learner");
  const other = { ...user, id: "second-account", display_name: "Other Learner" };
  vi.mocked(api.me).mockResolvedValue({ ok: true, status: 200, data: { user: other } });
  act(() =>
    client.setQueryData(accountSessionKey, { ok: true, status: 200, data: { user: other } }),
  );
  await screen.findByText("Hello, Other Learner");
  await screen.findByText("Your first enquiry starts with a Tutor");
  const request: ContactRequest = {
    id: "old-private-request",
    listing_id: "offer",
    learner_id: "old-learner",
    learner_alias: "Private alias",
    learner_usable: true,
    offer: {
      title: "Private old-account offer",
      description: "Private",
      domain_id: "school",
      subject_id: "subject-physics",
      level_id: "level-class-10",
      language_ids: [],
      currency: "INR",
      teaching_mode: "ONLINE",
      rate_paise: 50000,
      rate_unit: "HOUR",
      trial_kind: "NONE",
    },
    learning_requirements: "Private message never shown",
    preferred_times: "Tuesday",
    status: "PENDING",
    expires_at: "2026-12-01T00:00:00Z",
    created_at: "2026-11-03T00:00:00Z",
    server_time: "2026-11-03T00:00:00Z",
    reminder: null,
    request_policy_version: "contact-v1",
    connection_id: null,
    test_only: true,
  };
  await act(async () =>
    finish({ ok: true, status: 200, data: { requests: [request], next_cursor: null } }),
  );
  expect(screen.queryByText("Private old-account offer")).toBeNull();
  expect(screen.queryByText("Hello, Fictional Learner")).toBeNull();
});
it("clears the dashboard and redirects when a private endpoint returns 401", async () => {
  vi.mocked(api.connections).mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in" },
  });
  mount(<LearnerDashboard />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/signin", replace: true }));
  expect(screen.queryByText("Hello, Fictional Learner")).toBeNull();
});
it("preserves the last-role guard and updates the shared session after explicit role changes", async () => {
  vi.spyOn(api, "changeRoles").mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["LEARNER", "TUTOR"] } },
  });
  const client = mount(<AccountSettings />);
  const current = await screen.findByRole("checkbox", { name: "Learner" });
  expect(current.hasAttribute("disabled")).toBe(true);
  expect(api.changeRoles).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Tutor" }));
  await waitFor(() => expect(api.changeRoles).toHaveBeenCalledWith(["LEARNER", "TUTOR"]));
  await waitFor(() =>
    expect(client.getQueryData(accountSessionKey)).toMatchObject({
      ok: true,
      data: { user: { roles: ["LEARNER", "TUTOR"] } },
    }),
  );
  expect(screen.queryByText("Open admin dashboard")).toBeNull();
});
it("keeps sign-out failure visible and only navigates after a confirmed sign-out", async () => {
  vi.spyOn(api, "signOut")
    .mockResolvedValueOnce({ ok: false, error: { kind: "unavailable" } })
    .mockResolvedValueOnce({ ok: true, status: 204, data: undefined });
  mount(<AccountSettings />);
  await screen.findByRole("button", { name: "Sign out" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(api.signOut).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign out" }).hasAttribute("disabled")).toBe(false),
  );
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/signin", replace: true }));
});
