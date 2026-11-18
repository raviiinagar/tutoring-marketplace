import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountSettings } from "@/components/account-settings";
import { api, type User, type NotificationPreferenceView } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useLocation: () => window.location.hash.slice(1),
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
  vi.spyOn(api, "tutorPhoto").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      policy: {
        auto_publication: true,
        uploads_enabled: true,
        test_only: true,
        max_bytes: 1048576,
        media_types: ["image/png", "image/jpeg"],
        notice: "Fictional portrait",
      },
      photo: null,
    },
  });
  vi.spyOn(api, "notificationPreferences").mockResolvedValue({
    ok: true,
    status: 200,
    data: structuredClone(preferences),
  });
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
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
  expect(screen.getByRole("radio", { name: /^Learn/ })).toBeChecked();
  // ADR0021: every account manages its one profile photo here, Learners too.
  expect(await screen.findByRole("button", { name: "Upload photo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /This is a clear photo of me/ }));
  expect(screen.getByRole("button", { name: "Upload photo" })).toBeEnabled();
});

it("asks a new account once whether it learns, teaches or both, and saves the answer", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles_chosen: false } },
  });
  const changeRoles = vi.spyOn(api, "changeRoles").mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["TUTOR"], roles_chosen: true } },
  });
  mount();
  expect(
    await screen.findByRole("heading", { name: "How will you use Tutor Marketplace?" }),
  ).toBeVisible();
  for (const name of [/^Learn/, /^Teach/, /^Both/])
    expect(screen.getByRole("radio", { name })).not.toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: /^Teach/ }));
  await waitFor(() => expect(changeRoles).toHaveBeenCalledWith(["TUTOR"]));
  expect(await screen.findByRole("link", { name: "Go to your teaching" })).toHaveAttribute(
    "href",
    "/tutor",
  );
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
  const save = vi.spyOn(api, "saveNotificationPreferences").mockImplementation(async (value) => ({
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

it("scrolls to and focuses the requested Learn / Teach / Both section without changing roles", async () => {
  window.history.replaceState(null, "", "/account/settings#roles");
  const scroll = vi.fn();
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  const changeRoles = vi.spyOn(api, "changeRoles");
  try {
    mount();
    const section = await screen.findByRole("region", { name: "I want to" });
    await waitFor(() => expect(section).toHaveFocus());
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
    expect(screen.getByRole("radio", { name: /^Teach/ })).toBeVisible();
    expect(screen.getByRole("radio", { name: /^Teach/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^Learn/ })).toBeChecked();
    expect(changeRoles).not.toHaveBeenCalled();
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
