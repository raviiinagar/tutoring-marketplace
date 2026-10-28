import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { api, type AdminOverview } from "@/lib/api";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    activeProps: _active,
    activeOptions: _options,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    activeProps?: unknown;
    activeOptions?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const report: AdminOverview = {
  as_of: "2026-10-28T10:00:00Z",
  days: 30,
  timezone: "Asia/Kolkata",
  environment: "staging",
  test_only: false,
  scopes: ["SUPPORT"],
  audience: {
    accounts_total: 12,
    verified_accounts: 10,
    new_accounts: 4,
    successful_logins: 8,
    signed_in_accounts: 3,
    valid_sessions: 5,
    visits: null,
    page_views: null,
    tracking_started_at: null,
  },
  business: { enquiries: 6, pending_enquiries: 2, accepted_enquiries: 3 },
  finance: null,
  trend: [{ day: "2026-10-28", visits: null, logins: 8, signups: 4 }],
  queues: [],
  alerts: [],
  workers: [],
  activity: [],
};
it("shows unavailable historical visits honestly and switches the chart without exposing finance to Support", async () => {
  vi.spyOn(api, "adminOverview").mockResolvedValue({ ok: true, status: 200, data: report });
  render(<AdminDashboard />);
  expect(await screen.findByText("Observed visits")).toBeTruthy();
  expect(screen.getByText(/Visit tracking has just been enabled/)).toBeTruthy();
  expect(screen.queryByLabelText("Finance overview")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Logins" }));
  expect(screen.getByRole("img", { name: "logins trend over 30 days" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "7" } });
  await waitFor(() => expect(api.adminOverview).toHaveBeenLastCalledWith(7));
});
it("clears stale report data when the staff session expires", async () => {
  vi.spyOn(api, "adminOverview")
    .mockResolvedValueOnce({ ok: true, status: 200, data: report })
    .mockResolvedValue({
      ok: false,
      error: {
        kind: "http",
        status: 403,
        code: "STAFF_MFA_REQUIRED",
        message: "Verify MFA to continue.",
      },
    });
  render(<AdminDashboard />);
  await screen.findByText("Observed visits");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Verify MFA to continue.");
  expect(screen.queryByText("Observed visits")).toBeNull();
  expect(screen.queryByText("Account directory")).toBeNull();
});
it("searches the private account directory only after staff action and clears results on denial", async () => {
  vi.spyOn(api, "adminOverview").mockResolvedValue({ ok: true, status: 200, data: report });
  const search = vi
    .spyOn(api, "adminAccounts")
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        accounts: [
          {
            id: "account",
            display_name: "Fictional Learner",
            email: "fictional@example.invalid",
            status: "ACTIVE",
            roles: ["LEARNER"],
            created_at: report.as_of,
            email_verified_at: report.as_of,
            last_sign_in_at: report.as_of,
          },
        ],
        next_cursor: null,
      },
    })
    .mockResolvedValue({
      ok: false,
      error: { kind: "http", status: 403, code: "STAFF_MFA_REQUIRED", message: "Session expired." },
    });
  render(<AdminDashboard />);
  await screen.findByText("Account directory");
  expect(search).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load accounts" }));
  await screen.findByText("fictional@example.invalid");
  fireEvent.change(screen.getByLabelText("Search accounts by name or email"), {
    target: { value: "Changed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search accounts" }));
  await screen.findByText("Session expired.");
  expect(screen.queryByText("fictional@example.invalid")).toBeNull();
});
it("unified navigation includes only areas granted by the current MFA scope", async () => {
  vi.spyOn(api, "staffAccess").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      scopes: ["FINANCE"],
      mfa_enrolled: true,
      authenticated: true,
      expires_at: "2026-10-29T00:00:00Z",
    },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminShell title="Admin dashboard">
        <p>Fictional dashboard</p>
      </AdminShell>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: "Payments & coupons" }).length).toBeGreaterThan(0),
  );
  expect(screen.queryByRole("link", { name: "Tutor evidence" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "Operations" }).length).toBeGreaterThan(0);
});
