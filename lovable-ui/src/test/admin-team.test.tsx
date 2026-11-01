import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminTeamManager } from "@/components/admin-team";
import { AdminShell } from "@/components/admin-shell";
import { AuthShell } from "@/components/account/ui";
import { api, type AdminMember, type StaffAccess } from "@/lib/api";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    activeProps: _a,
    activeOptions: _b,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    activeProps?: unknown;
    activeOptions?: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const root: StaffAccess = {
  role: "SUPER_ADMIN",
  scopes: ["SUPPORT", "TRUST", "FINANCE"],
  mfa_enrolled: false,
  mfa_required: false,
  testing_mfa_bypass_until: "2026-11-03T10:25:48Z",
  authenticated: true,
  expires_at: "2026-11-01T14:30:00Z",
};
const member: AdminMember = {
  id: "reviewer",
  display_name: "Fictional reviewer",
  email: "reviewer@example.invalid",
  status: "ACTIVE",
  enabled: true,
  role: "ADMIN",
  scopes: ["SUPPORT", "TRUST"],
  updated_at: "2026-11-01T14:00:00Z",
};
const owner: AdminMember = {
  ...member,
  id: "owner",
  display_name: "Fictional owner",
  email: "owner@example.invalid",
  role: "SUPER_ADMIN",
  scopes: ["SUPPORT", "TRUST", "FINANCE"],
};
function mount(children: React.ReactNode) {
  vi.spyOn(api, "me").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in." },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthShell title="Admin team">{children}</AuthShell>
    </QueryClientProvider>,
  );
}
it("Super Admin grants verified-account access and preserves the protected owner row", async () => {
  vi.spyOn(api, "staffAccess").mockResolvedValue({ ok: true, status: 200, data: root });
  const team = vi
    .spyOn(api, "adminTeam")
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: { admins: [owner, member], next_cursor: null },
    });
  const grant = vi
    .spyOn(api, "grantAdmin")
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: { user_id: member.id, role: "ADMIN", enabled: true },
    });
  mount(<AdminTeamManager />);
  await screen.findByText("Fictional owner");
  expect(screen.getAllByRole("button", { name: "Revoke access" })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Verified account email"), {
    target: { value: member.email },
  });
  fireEvent.change(screen.getByLabelText("Reason for granting access"), {
    target: { value: "Assign daily review work" },
  });
  fireEvent.submit(screen.getByLabelText("Verified account email").closest("form")!);
  await waitFor(() => expect(grant).toHaveBeenCalledWith(member.email, "Assign daily review work"));
  await screen.findByText(/Admin access granted/);
  expect(team).toHaveBeenCalledTimes(2);
});
it("revocation requires an explicit confirmation reason and refreshes the current access status", async () => {
  vi.spyOn(api, "staffAccess").mockResolvedValue({ ok: true, status: 200, data: root });
  vi.spyOn(api, "adminTeam")
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { admins: [owner, member], next_cursor: null },
    })
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: { admins: [owner, { ...member, enabled: false }], next_cursor: null },
    });
  const revoke = vi
    .spyOn(api, "revokeAdmin")
    .mockResolvedValue({ ok: true, status: 200, data: { user_id: member.id, enabled: false } });
  mount(<AdminTeamManager />);
  fireEvent.click(await screen.findByRole("button", { name: "Revoke access" }));
  expect(revoke).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Reason for revoking access"), {
    target: { value: "Review assignment completed" },
  });
  fireEvent.submit(screen.getByLabelText("Reason for revoking access").closest("form")!);
  await waitFor(() =>
    expect(revoke).toHaveBeenCalledWith(member.id, "Review assignment completed"),
  );
  await screen.findByText("Access revoked");
  expect(screen.queryByRole("button", { name: "Revoke access" })).toBeNull();
});
it("ordinary Admins never load the team directory or see grant controls", async () => {
  vi.spyOn(api, "staffAccess").mockResolvedValue({
    ok: true,
    status: 200,
    data: { ...root, role: "ADMIN", scopes: ["SUPPORT", "TRUST"] },
  });
  const team = vi.spyOn(api, "adminTeam");
  mount(<AdminTeamManager />);
  await screen.findByText(/Only the Super Admin can manage admin access/);
  expect(team).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Verified account email")).toBeNull();
});
it("ordinary Admin navigation contains review tools and excludes owner-only areas", async () => {
  vi.spyOn(api, "staffAccess").mockResolvedValue({
    ok: true,
    status: 200,
    data: { ...root, role: "ADMIN", scopes: ["SUPPORT", "TRUST"] },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AdminShell title="Review workspace">
        <p>Review work</p>
      </AdminShell>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: "Tutor evidence" }).length).toBeGreaterThan(0),
  );
  for (const name of [
    "Manage admins",
    "Payments & coupons",
    "Marketplace reports",
    "Operations",
    "Notifications",
    "Catalogue",
  ])
    expect(screen.queryByRole("link", { name })).toBeNull();
  expect(screen.getByText("Testing: password-protected access")).toBeTruthy();
});
