import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountSettings } from "@/components/account-settings";
import { api, type User, type NotificationPreferenceView } from "@/lib/api";
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
  id: "fictional-account",
  display_name: "Fictional Learner",
  email: "learner@example.invalid",
  email_verified: true,
  roles: ["LEARNER"],
  created_at: "2026-11-05",
};
const preferences: NotificationPreferenceView = {
  preferences: {
    enquiry_email: true,
    chat_email: true,
    availability_email: false,
    marketing_email: false,
    notice_version: "notification-preferences-v1",
  },
  service_email: true,
  policy: { notice: "Security and financial notices remain enabled." },
};
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <AccountSettings />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.spyOn(api, "me").mockResolvedValue({ ok: true, status: 200, data: { user } });
  vi.spyOn(api, "sessions").mockResolvedValue({ ok: true, status: 200, data: { sessions: [] } });
  vi.spyOn(api, "staffAccess").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 403, code: "FORBIDDEN", message: "No staff access" },
  });
  vi.spyOn(api, "notificationPreferences").mockResolvedValue({
    ok: true,
    status: 200,
    data: structuredClone(preferences),
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  navigate.mockClear();
});

it("keeps the reference account cards truthful for a learner without identity or portrait tools", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "General Information" })).toBeTruthy();
  expect(screen.getByText("Email verified", { exact: true })).toBeTruthy();
  expect(screen.queryByText("Identity reviewed", { exact: true })).toBeNull();
  expect(screen.queryByRole("link", { name: "Manage Tutor photo" })).toBeNull();
  expect(screen.getByRole("link", { name: "My Receipts" }).getAttribute("href")).toBe(
    "/payments/history",
  );
  expect(screen.getByText(/Identity verification is optional/)).toBeTruthy();
  expect((screen.getByLabelText("Learner") as HTMLInputElement).disabled).toBe(true);
});

it("saves an account name through the backend and updates the shared signed-in account", async () => {
  const updated = { ...user, display_name: "Updated Fictional Name" };
  const save = vi
    .spyOn(api, "updateAccountProfile")
    .mockResolvedValue({ ok: true, status: 200, data: { user: updated } });
  const client = mount();
  const input = await screen.findByLabelText("Account name");
  fireEvent.change(input, { target: { value: " Updated Fictional Name " } });
  fireEvent.click(screen.getByRole("button", { name: "Save general information" }));
  expect(await screen.findByText("General information saved.")).toBeTruthy();
  expect(save).toHaveBeenCalledWith("Updated Fictional Name");
  expect(client.getQueryData(accountSessionKey)).toEqual({
    ok: true,
    status: 200,
    data: { user: updated },
  });
});

it("saves explicit notification choices while leaving financial and security notices enabled", async () => {
  const save = vi
    .spyOn(api, "saveNotificationPreferences")
    .mockImplementation(async (value) => ({
      ok: true,
      status: 200,
      data: { ...preferences, preferences: value },
    }));
  mount();
  const messages = await screen.findByLabelText("New messages");
  fireEvent.click(messages);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save notification preferences" }));
  expect(await screen.findByText("Notification preferences saved.")).toBeTruthy();
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...preferences.preferences, chat_email: false }),
  );
  expect(screen.getByText("Security and financial notices remain enabled.")).toBeTruthy();
});
