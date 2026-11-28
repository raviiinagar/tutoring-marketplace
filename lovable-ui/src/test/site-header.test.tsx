import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SiteFooter, SiteHeader } from "@/components/account/ui";
import { api, type Catalogue, type User } from "@/lib/api";
const { navigate, route } = vi.hoisted(() => ({ navigate: vi.fn(), route: { pathname: "/" } }));
const visibility = vi.hoisted(() => ({
  teachingOffers: true,
  howItWorks: true,
  subjectExplorer: true,
}));
const features = vi.hoisted(() => ({ community: true }));
vi.mock("@/lib/site-visibility", () => ({
  homepageSections: visibility,
  siteFeatures: features,
}));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useNavigate: () => navigate,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: route.pathname } }),
    Link: React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; hash?: string }
    >(({ to, hash, children, onClick, ...props }, ref) => (
      <a
        ref={ref}
        href={to + (hash ? "#" + hash : "")}
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
  vi.spyOn(api, "changeRoles");
  navigate.mockClear();
  vi.spyOn(api, "communityPolicy").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      enabled: true,
      rules_version: "test",
      reactions: [],
      max_message_length: 1000,
      rules: [],
    },
  });
  vi.spyOn(api, "feedbackPolicy").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      enabled: true,
      screenshots_enabled: false,
      categories: [],
      public_categories: [],
      statuses: [],
      max_screenshot_bytes: 0,
      notice: "",
    },
  });
});
it("header links to the beta Community and Feedback pages on desktop and mobile", async () => {
  mount(true);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByRole("link", { name: "Community" })).toHaveAttribute(
    "href",
    "/community",
  );
  expect(within(nav).getByRole("link", { name: "Feedback" })).toHaveAttribute("href", "/feedback");
  fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));
  const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
  expect(within(mobile).getByRole("link", { name: "Community" })).toHaveAttribute(
    "href",
    "/community",
  );
  expect(within(mobile).getByRole("link", { name: "Beta feedback" })).toHaveAttribute(
    "href",
    "/feedback",
  );
});
it("Community hidden by the owner leaves no header link and skips its policy request", async () => {
  features.community = false;
  try {
    mount();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Feedback" })).toBeVisible();
    expect(within(nav).queryByRole("link", { name: "Community" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));
    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(mobile).queryByRole("link", { name: "Community" })).toBeNull();
    await waitFor(() => expect(api.feedbackPolicy).toHaveBeenCalled());
    expect(api.communityPolicy).not.toHaveBeenCalled();
  } finally {
    features.community = true;
  }
});
it("a beta feature switched off on the API disappears from the header", async () => {
  vi.mocked(api.communityPolicy).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      enabled: false,
      rules_version: "test",
      reactions: [],
      max_message_length: 1000,
      rules: [],
    },
  });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await waitFor(() => expect(within(nav).queryByRole("link", { name: "Community" })).toBeNull());
  expect(within(nav).getByRole("link", { name: "Feedback" })).toBeVisible();
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
  expect(within(nav).getByRole("link", { name: "Become a Tutor" })).toHaveAttribute(
    "href",
    "/auth/signup",
  );
  expect(within(nav).getByRole("link", { name: "Help" })).toHaveAttribute("href", "/#how-it-works");
  expect(within(nav).queryByRole("link", { name: "Join us" })).toBeNull();
  expect(screen.getByRole("link", { name: "Tutor Marketplace home" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Search for a teacher/ })).toBeNull();
});
it("while homepage steps and subjects are hidden, Help opens Support and no link points at them", async () => {
  visibility.howItWorks = false;
  visibility.subjectExplorer = false;
  try {
    mount(true);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Help" })).toHaveAttribute("href", "/support");
    fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));
    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(mobile).getByRole("link", { name: "Help" })).toHaveAttribute("href", "/support");
    expect(within(mobile).queryByRole("link", { name: "Explore subjects" })).toBeNull();
  } finally {
    visibility.howItWorks = true;
    visibility.subjectExplorer = true;
  }
});
it("pending session announces checking without a false logged-in state", () => {
  vi.mocked(api.me).mockImplementation(() => new Promise(() => {}));
  mount(true);
  expect(screen.getByRole("status")).toHaveTextContent("Checking account");
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.queryByRole("button", { name: /My account/ })).toBeNull();
});
const adsOf = (...ads: { status: string; eligible: boolean }[]) =>
  vi.spyOn(api, "listings").mockResolvedValue({
    ok: true,
    status: 200,
    data: { listings: ads, eligible_subject_ids: [], tutor_pro_active: false },
  } as never);
it("the account menu only switches between Student and Teacher, keyboard accessible (owner, 28 Nov 2026)", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["TUTOR"] } },
  });
  adsOf({ status: "PUBLISHED", eligible: true });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  const account = await within(nav).findByRole("button", { name: "T My account" });
  // ADR0021: once an ad is online the header link becomes "Teaching dashboard".
  expect(await within(nav).findByRole("link", { name: "Teaching dashboard" })).toHaveAttribute(
    "href",
    "/tutor/dashboard",
  );
  fireEvent.keyDown(account, { key: "ArrowDown" });
  const menu = await screen.findByRole("menu");
  const student = within(menu).getByRole("menuitemradio", { name: /^Student/ });
  const teacher = within(menu).getByRole("menuitemradio", { name: /^Teacher/ });
  // A teaching-only account is on the teacher side; nothing else is listed in the menu.
  expect(teacher).toHaveAttribute("aria-checked", "true");
  expect(student).toHaveAttribute("aria-checked", "false");
  expect(within(menu).queryAllByRole("menuitem")).toHaveLength(0);
  fireEvent.click(teacher);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/tutor/dashboard" }));
  expect(api.changeRoles).not.toHaveBeenCalled();
  expect(within(nav).queryByRole("link", { name: "Sign in" })).toBeNull();
});
it("choosing Student adds the Learner role without removing Teacher, so ads stay online", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["TUTOR"] } },
  });
  vi.mocked(api.changeRoles).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["LEARNER", "TUTOR"] } },
  });
  adsOf({ status: "PUBLISHED", eligible: true });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  fireEvent.keyDown(await within(nav).findByRole("button", { name: "T My account" }), {
    key: "ArrowDown",
  });
  fireEvent.click(
    within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /^Student/ }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/account" }));
  expect(api.changeRoles).toHaveBeenCalledExactlyOnceWith(["TUTOR", "LEARNER"]);
});
it("a Tutor who has not published yet still sees Become a Tutor, opening their set-up", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["TUTOR"] } },
  });
  const listings = adsOf({ status: "DRAFT", eligible: false });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await within(nav).findByRole("button", { name: "T My account" });
  await waitFor(() => expect(listings).toHaveBeenCalled());
  expect(within(nav).getByRole("link", { name: "Become a Tutor" })).toHaveAttribute(
    "href",
    "/tutor",
  );
  expect(within(nav).queryByRole("link", { name: "Teaching dashboard" })).toBeNull();
});
it("an account that learns and teaches switches sides by page, without changing its roles", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["LEARNER", "TUTOR"] } },
  });
  const listings = adsOf();
  route.pathname = "/tutor/listings";
  try {
    mount();
    await waitFor(() => expect(listings).toHaveBeenCalled());
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    fireEvent.keyDown(await within(nav).findByRole("button", { name: "T My account" }), {
      key: "ArrowDown",
    });
    const menu = await screen.findByRole("menu");
    // On a Tutor page the teacher side is the current one.
    expect(within(menu).getByRole("menuitemradio", { name: /^Teacher/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /^Student/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/account" }));
    expect(api.changeRoles).not.toHaveBeenCalled();
  } finally {
    route.pathname = "/";
  }
});
it("a signed-in account that has not chosen Learn or Teach yet can still enter onboarding", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles_chosen: false } },
  });
  mount();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await within(nav).findByRole("button", { name: "T My account" });
  expect(within(nav).getByRole("link", { name: "Become a Tutor" })).toHaveAttribute(
    "href",
    "/tutor",
  );
});
it("an account that chose Learn sees no Become a Tutor in the header, menu or footer", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles_chosen: true } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <SiteHeader />
      <SiteFooter />
    </QueryClientProvider>,
  );
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  await within(nav).findByRole("button", { name: "T My account" });
  expect(screen.queryByRole("link", { name: "Become a Tutor" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Open menu$/ }));
  expect(
    within(screen.getByRole("navigation", { name: "Mobile navigation" })).queryByRole("link", {
      name: "Become a Tutor",
    }),
  ).toBeNull();
});
it("signed-out visitors still see Become a Tutor in the footer", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <SiteHeader />
      <SiteFooter />
    </QueryClientProvider>,
  );
  const footer = screen.getByRole("navigation", { name: "Footer navigation" });
  await waitFor(() => expect(api.me).toHaveBeenCalled());
  expect(within(footer).getByRole("link", { name: "Become a Tutor" })).toHaveAttribute(
    "href",
    "/tutor",
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
  expect(screen.queryByRole("button", { name: /Search for a teacher/ })).toBeNull();
  window.scrollY = 301;
  fireEvent.scroll(window);
  expect(screen.getAllByRole("button", { name: /Search for a teacher/ })).toHaveLength(2);
  window.scrollY = 200;
  fireEvent.scroll(window);
  expect(screen.queryByRole("button", { name: /Search for a teacher/ })).toBeNull();
  unmount();
  mount();
  expect(screen.getAllByRole("button", { name: /Search for a teacher/ })).toHaveLength(2);
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
  const trigger = screen.getAllByRole("button", { name: /Search for a teacher/ })[0]!;
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
  const trigger = screen.getAllByRole("button", { name: /Search for a teacher/ })[0]!;
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByText("Loading subjects...")).toBeVisible();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).toBeNull();
});
