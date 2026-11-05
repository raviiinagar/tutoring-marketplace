import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SiteHeader } from "@/components/account/ui";
import { api, type Catalogue, type User } from "@/lib/api";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useNavigate: () => navigate,
    Link: React.forwardRef<HTMLAnchorElement, any>(({ to, children, onClick, ...props }, ref) => (
      <a
        ref={ref}
        href={to}
        {...props}
        onClick={(event) => {
          onClick?.(event);
          event.preventDefault();
        }}
      >
        {children}
      </a>
    )),
  };
});
const anonymous = {
  ok: false as const,
  error: { kind: "http" as const, status: 401, code: "AUTH_REQUIRED", message: "Sign in" },
};
const user: User = {
  id: "test-user",
  display_name: "Test user",
  email: "fixture@example.invalid",
  email_verified: true,
  created_at: "2026-11-03",
  roles: ["LEARNER"],
};
const catalogue: Catalogue = {
  domains: [],
  terms: [
    {
      id: "subject-mathematics",
      kind: "SUBJECT",
      label: "Mathematics",
      aliases: ["Maths"],
      domain_ids: ["school"],
      active: true,
    },
  ],
};
function mount(homepage = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteHeader homepage={homepage} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0, writable: true });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390, writable: true });
  vi.spyOn(api, "me").mockResolvedValue(anonymous);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockReset();
});
it("anonymous desktop navigation has own brand, help, teaching and one sign-in destination", async () => {
  mount(true);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await within(nav).findByRole("link", { name: "Sign in" });
  expect(within(nav).getByRole("link", { name: "Give private classes" })).toHaveAttribute(
    "href",
    "/auth/signup",
  );
  expect(within(nav).getByRole("link", { name: "Help" })).toHaveAttribute("href", "/#how-it-works");
  expect(within(nav).queryByRole("link", { name: "Join us" })).toBeNull();
  expect(screen.getByRole("link", { name: "Tutor Marketplace home" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Search for a teacher" })).toBeNull();
});
it("pending session announces checking without a false logged-in state", () => {
  vi.mocked(api.me).mockImplementation(() => new Promise(() => {}));
  mount(true);
  expect(screen.getByRole("status")).toHaveTextContent("Checking account");
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.queryByRole("button", { name: "My account" })).toBeNull();
});
it("signed-in Tutor has direct onboarding and a keyboard-accessible grouped account menu", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["TUTOR"] } },
  });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  const account = await within(nav).findByRole("button", { name: "My account" });
  expect(within(nav).getByRole("link", { name: "Give private classes" })).toHaveAttribute(
    "href",
    "/tutor/dashboard",
  );
  fireEvent.keyDown(account, { key: "ArrowDown" });
  const menu = await screen.findByRole("menu");
  for (const name of ["Dashboard", "My Account", "Saved Tutors", "My enquiries", "My messages"])
    expect(within(menu).getByRole("menuitem", { name })).toBeVisible();
  expect(within(nav).queryByRole("link", { name: "Sign in" })).toBeNull();
  fireEvent.keyDown(menu, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});
it("a signed-in Learner is sent to account role selection without changing roles", async () => {
  vi.mocked(api.me).mockResolvedValue({ ok: true, status: 200, data: { user } });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await within(nav).findByRole("button", { name: "My account" });
  expect(within(nav).getByRole("link", { name: "Give private classes" })).toHaveAttribute(
    "href",
    "/account/settings",
  );
});
it("mobile disclosure closes on links and Escape restores the opener", async () => {
  mount(true);
  const opener = await screen.findByRole("button", { name: "Open menu" });
  fireEvent.click(opener);
  expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(opener).toHaveFocus();
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
  fireEvent.click(opener);
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("link", {
      name: "Find Tutors",
    }),
  );
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
});
it("mobile disclosure closes on history and desktop resizing", async () => {
  mount(true);
  const opener = await screen.findByRole("button", { name: "Open menu" });
  fireEvent.click(opener);
  fireEvent(window, new PopStateEvent("popstate"));
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
  fireEvent.click(opener);
  window.innerWidth = 1280;
  fireEvent(window, new Event("resize"));
  expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
});
it("homepage search appears after the hero scroll threshold; other pages show it immediately", () => {
  const { unmount } = mount(true);
  expect(screen.queryByRole("button", { name: "Search for a teacher" })).toBeNull();
  window.scrollY = 301;
  fireEvent.scroll(window);
  expect(screen.getAllByRole("button", { name: "Search for a teacher" })).toHaveLength(2);
  window.scrollY = 200;
  fireEvent.scroll(window);
  expect(screen.queryByRole("button", { name: "Search for a teacher" })).toBeNull();
  unmount();
  mount();
  expect(screen.getAllByRole("button", { name: "Search for a teacher" })).toHaveLength(2);
});
it("search lazily fetches real catalogue, retries failures and navigates with chosen filters", async () => {
  const catalogueRequest = vi
    .spyOn(api, "catalogue")
    .mockResolvedValueOnce({
      ok: false,
      error: { kind: "unavailable" },
    })
    .mockResolvedValueOnce({ ok: true, status: 200, data: catalogue });
  mount();
  expect(catalogueRequest).not.toHaveBeenCalled();
  const trigger = screen.getAllByRole("button", { name: "Search for a teacher" })[0]!;
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  await screen.findByRole("alert");
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry search options" }));
  const subject = await screen.findByRole("combobox", { name: "Subject or exam" });
  fireEvent.change(subject, { target: { value: "Maths" } });
  fireEvent.click(screen.getByRole("option", { name: "Mathematics" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Search$/ }));
  expect(navigate).toHaveBeenCalledWith({
    to: "/tutors",
    search: { subject_id: "subject-mathematics" },
  });
  expect(catalogueRequest).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("closing a loading search returns focus to its opening control", async () => {
  vi.spyOn(api, "catalogue").mockImplementation(() => new Promise(() => {}));
  mount();
  const trigger = screen.getAllByRole("button", { name: "Search for a teacher" })[0]!;
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByText("Loading subjects...")).toBeVisible();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).toBeNull();
});
