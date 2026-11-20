import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TutorDashboard } from "@/components/tutor-dashboard";
import { Route as ListingsRoute } from "@/routes/tutor_.listings";
import { api, type TeachingListing, type User } from "@/lib/api";
import {
  canResumeOffer,
  canSubmitOffer,
  focusTutorOffers,
  offerAvailability,
} from "@/lib/tutor-workspace";
import { accountSessionKey } from "@/lib/session";
import { reputationApi } from "@/lib/tutor-reputation-api";
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  createFileRoute: () => (options: unknown) => ({ options }),
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
  id: "tutor-first",
  display_name: "Fictional Tutor",
  email: "tutor@example.invalid",
  email_verified: true,
  roles: ["TUTOR"],
  created_at: "2026-11-03",
};
const listing: TeachingListing = {
  id: "offer-first",
  user_id: user.id,
  revision: 4,
  profile_revision: 1,
  status: "DRAFT",
  eligible: false,
  requires_profile_review: false,
  review_reason: null,
  safety_reason: null,
  offer: {
    title: "Physics with worked examples",
    description: "Clear guided explanations of Physics.",
    domain_id: "school",
    subject_id: "subject-physics",
    level_id: "level-class-10",
    language_ids: ["language-english"],
    currency: "INR",
    teaching_mode: "ONLINE",
    rate_paise: 50000,
    rate_unit: "HOUR",
    trial_kind: "NONE",
  },
};
const clients: QueryClient[] = [];
function mount(content = <TutorDashboard />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  vi.spyOn(reputationApi, "progression").mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 503,
      code: "UNAVAILABLE",
      message: "Progression is unavailable.",
    },
  });
  vi.spyOn(api, "me").mockResolvedValue({ ok: true, status: 200, data: { user } });
  vi.spyOn(api, "tutor").mockResolvedValue({
    ok: true,
    status: 200,
    data: { profile: null, claims: [], evidence: [] },
  });
  vi.spyOn(api, "listings").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      listings: [listing],
      eligible_subject_ids: ["subject-physics"],
      tutor_pro_active: false,
    },
  });
  vi.spyOn(api, "tutorPro").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      policy: { version: "tutor-pro-v1", amount_paise: 60000, currency: "INR", access_days: 30 },
      checkout_available: false,
      active: null,
      purchase: null,
    },
  });
  vi.spyOn(api, "tutorRequests").mockResolvedValue({
    ok: true,
    status: 200,
    data: { requests: [], next_cursor: null },
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  navigate.mockReset();
});
it("publishes for free while preserving subject, profile and safety restrictions", () => {
  expect(canSubmitOffer(listing, true, ["subject-physics"])).toBe(true);
  expect(canSubmitOffer(listing, false, ["subject-physics"])).toBe(true);
  expect(canSubmitOffer(listing, true, [])).toBe(false);
  expect(
    canSubmitOffer({ ...listing, requires_profile_review: true }, true, ["subject-physics"]),
  ).toBe(false);
  expect(
    canSubmitOffer({ ...listing, status: "SAFETY_SUSPENDED" }, true, ["subject-physics"]),
  ).toBe(false);
  expect(canResumeOffer({ ...listing, status: "PAUSED" }, true, ["subject-physics"])).toBe(true);
  expect(canResumeOffer({ ...listing, status: "PAUSED" }, false, ["subject-physics"])).toBe(true);
  expect(
    canSubmitOffer({ ...listing, publication_restricted: true }, false, ["subject-physics"]),
  ).toBe(false);
  expect(offerAvailability({ ...listing, status: "PUBLISHED", eligible: false })).toMatch(
    /currently unavailable/,
  );
  expect(
    focusTutorOffers([
      { ...listing, id: "public", status: "PUBLISHED", eligible: true },
      { ...listing, id: "restricted", status: "SAFETY_SUSPENDED" },
    ]).map((item) => item.id),
  ).toEqual(["restricted", "public"]);
});
it("keeps Tutor Pro and the Tutor level out of the way until an ad is online (ADR0021)", async () => {
  mount();
  await screen.findByRole("heading", { name: "Learners can't find you yet" });
  expect(screen.queryByRole("heading", { name: "Tutor Pro" })).toBeNull();
  expect(screen.queryByLabelText("Tutor level")).toBeNull();
});
it("shows actual offer and Pro state without inventing revenue or visitor metrics", async () => {
  vi.mocked(api.listings).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      listings: [{ ...listing, status: "PUBLISHED", eligible: true }],
      eligible_subject_ids: ["subject-physics"],
      tutor_pro_active: false,
    },
  });
  mount();
  expect(await screen.findByText("Not active")).toBeTruthy();
  // Approved dashboard (20 Nov 2026): enquiries are back; My ads has its own tab and the
  // Tutor level lives in Evaluations.
  expect(screen.getByRole("heading", { name: "Enquiries" })).toBeVisible();
  expect(await screen.findByRole("heading", { name: "No enquiries yet" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "My ads" })).toBeNull();
  expect(screen.queryByText(listing.offer.title)).toBeNull();
  expect(screen.queryByLabelText("Your Tutor level")).toBeNull();
  expect(screen.queryByText(/Total earnings|Profile views|Booked lessons/)).toBeNull();
});
it("keeps a failed listings response distinct from an empty dashboard", async () => {
  vi.mocked(api.listings).mockResolvedValueOnce({ ok: false, error: { kind: "unavailable" } });
  mount();
  await screen.findByText("Your ads could not be loaded.");
  // Unknown is not the same as offline: no claim that learners cannot find this Tutor.
  expect(screen.queryByRole("heading", { name: "Learners can't find you yet" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry your ads" }));
  await screen.findByRole("heading", { name: "Learners can't find you yet" });
  expect(screen.queryByText("Your ads could not be loaded.")).toBeNull();
});
it("does not request private Tutor data for an account without the Tutor role", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["LEARNER"] } },
  });
  mount();
  await screen.findByText("Start teaching");
  // The invitation leads into the unified flow instead of asking the owner to
  // pick a role first. No role has to be chosen before teaching.
  expect(screen.getByRole("link", { name: "Start your teaching introduction" })).toHaveAttribute(
    "href",
    "/tutor",
  );
  expect(screen.queryByRole("link", { name: "Choose your account roles" })).not.toBeInTheDocument();
  expect(api.listings).not.toHaveBeenCalled();
  expect(api.tutor).not.toHaveBeenCalled();
});
it("gives a new Tutor with no profile or ad one first step instead of empty panels", async () => {
  vi.mocked(api.listings).mockResolvedValue({
    ok: true,
    status: 200,
    data: { listings: [], eligible_subject_ids: [], tutor_pro_active: false },
  });
  mount();
  expect(await screen.findByRole("heading", { name: "Create your first ad" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Become a Tutor" })).toHaveAttribute("href", "/tutor");
  expect(screen.queryByRole("heading", { name: "Profile & identity" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Recent learner enquiries" })).toBeNull();
});
it("separates having a teaching workspace from having a published ad", async () => {
  mount();
  // Workspace access alone must never read as public visibility (ADR0021: say it plainly).
  expect(await screen.findByRole("heading", { name: "Learners can't find you yet" })).toBeVisible();
  expect(
    screen.getByText(/Nothing is published yet, so learners cannot see or contact you/),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Publish my first ad" })).toHaveAttribute(
    "href",
    "/tutor/listings",
  );
});
it("ignores old private listings after the authoritative account changes", async () => {
  let finish!: (value: Awaited<ReturnType<typeof api.listings>>) => void;
  vi.mocked(api.listings)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: { listings: [], eligible_subject_ids: [], tutor_pro_active: false },
    });
  const client = mount();
  await waitFor(() => expect(api.listings).toHaveBeenCalledTimes(1));
  const other = { ...user, id: "tutor-second" };
  vi.mocked(api.me).mockResolvedValue({ ok: true, status: 200, data: { user: other } });
  act(() =>
    client.setQueryData(accountSessionKey, { ok: true, status: 200, data: { user: other } }),
  );
  // The second account has no profile or ad yet, so it sees the single first step (ADR0021).
  await screen.findByRole("heading", { name: "Create your first ad" });
  await act(async () =>
    finish({
      ok: true,
      status: 200,
      data: {
        listings: [listing],
        eligible_subject_ids: ["subject-physics"],
        tutor_pro_active: true,
      },
    }),
  );
  expect(screen.queryByText(listing.offer.title)).toBeNull();
  // The first account's late listings must not replace the second account's first step.
  expect(screen.getByRole("heading", { name: "Create your first ad" })).toBeVisible();
});
it("hides private workspace data and requests sign-in after a private 401", async () => {
  vi.mocked(api.tutorPro).mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in" },
  });
  mount();
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/signin", replace: true }));
  expect(screen.queryByRole("button", { name: "Manage my ads" })).toBeNull();
});

it("counts paused ads as offline without claiming unavailable published ads are available", async () => {
  vi.mocked(api.listings).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      listings: [
        { ...listing, id: "paused", status: "PAUSED" },
        { ...listing, id: "unavailable", status: "PUBLISHED", eligible: false },
      ],
      eligible_subject_ids: ["subject-physics"],
      tutor_pro_active: false,
    },
  });
  mount();
  // Neither ad is presented as available to learners (each ad's own state is on My ads).
  expect(await screen.findByRole("heading", { name: "Learners can't find you yet" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Tutor Pro" })).toBeNull();
});

const enquiry = {
  server_time: "2026-11-20T10:00:00.000Z",
  reminder: null,
  id: "request-first",
  offer: listing.offer,
  status: "PENDING" as const,
  expires_at: "2026-11-22T10:00:00.000Z",
  created_at: "2026-11-19T10:00:00.000Z",
  learning_requirements: "Fictional learner needs help with electrostatics.",
  preferred_times: "Weekday evenings",
  can_accept: true,
  can_decline: true,
  unavailable_reason: null,
  connection_id: null,
  test_only: false,
};
it("shows enquiries on the dashboard with the time left to reply and a way into the chat", async () => {
  vi.mocked(api.tutorRequests).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      requests: [
        enquiry,
        {
          ...enquiry,
          id: "request-accepted",
          status: "ACCEPTED",
          learning_requirements: "Fictional revision of optics.",
          preferred_times: null,
          can_accept: false,
          can_decline: false,
          connection_id: "connection-first",
        },
        {
          ...enquiry,
          id: "request-expired",
          expires_at: "2026-11-20T09:00:00.000Z",
          learning_requirements: "Fictional expired enquiry.",
          preferred_times: null,
        },
      ],
      next_cursor: null,
    },
  });
  mount();
  expect(
    await screen.findByText("Fictional learner needs help with electrostatics."),
  ).toBeVisible();
  expect(screen.getByText("Weekday evenings")).toBeVisible();
  expect(screen.getByText("Reply within 2 days")).toBeVisible();
  expect(screen.getByRole("link", { name: "Reply" })).toHaveAttribute("href", "/connections");
  expect(screen.getByText("Accepted")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open chat" })).toBeVisible();
  // A past deadline reads as expired, never as still waiting for a reply.
  expect(screen.getByText("Expired")).toBeVisible();
  // Only the enquiry that still waits is counted.
  expect(
    screen.getByRole("heading", { name: /^Enquiries\s*1 waiting for a reply$/ }),
  ).toBeVisible();
});
it("keeps a failed enquiries response distinct from having no enquiries", async () => {
  vi.mocked(api.tutorRequests).mockResolvedValueOnce({ ok: false, error: { kind: "unavailable" } });
  mount();
  expect(await screen.findByText("Your enquiries could not be loaded.")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "No enquiries yet" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry your enquiries" }));
  expect(await screen.findByRole("heading", { name: "No enquiries yet" })).toBeVisible();
});

it("invites a Learner from teaching offers into the introduction without reading private Tutor data", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, roles: ["LEARNER"] } },
  });
  const ListingsPage = ListingsRoute.options.component!;
  mount(<ListingsPage />);
  expect(
    await screen.findByRole("link", { name: "Start your teaching introduction" }),
  ).toHaveAttribute("href", "/tutor");
  expect(screen.queryByText("Enable the Tutor role before managing teaching offers.")).toBeNull();
  expect(screen.queryByRole("link", { name: "Choose your account roles" })).toBeNull();
  expect(api.tutor).not.toHaveBeenCalled();
  expect(api.listings).not.toHaveBeenCalled();
});
