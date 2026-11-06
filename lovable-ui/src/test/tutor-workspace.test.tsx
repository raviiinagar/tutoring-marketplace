import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TutorDashboard } from "@/components/tutor-dashboard";
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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <TutorDashboard />
    </QueryClientProvider>,
  );
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
it("shows actual draft and Pro state without inventing revenue or visitor metrics", async () => {
  mount();
  await screen.findByText(listing.offer.title);
  expect(screen.getByText("Not active")).toBeTruthy();
  expect(screen.getByText("No incoming enquiries yet")).toBeTruthy();
  expect(screen.queryByText(/Total earnings|Profile views|Booked lessons/)).toBeNull();
});
it("keeps a failed listings response distinct from an empty dashboard", async () => {
  vi.mocked(api.listings).mockResolvedValueOnce({ ok: false, error: { kind: "unavailable" } });
  mount();
  await screen.findByText("Teaching offers could not be loaded.");
  expect(screen.queryByText("Ready to describe your classes?")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry teaching offers" }));
  await screen.findByText(listing.offer.title);
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
it("separates having a teaching workspace from having a published ad", async () => {
  mount();
  // Workspace access alone must never read as public visibility.
  expect(
    await screen.findByText(/Nothing is published yet, so learners cannot see your ads/),
  ).toBeVisible();
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
  await screen.findByText("Ready to describe your classes?");
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
});
it("hides private workspace data and requests sign-in after a private 401", async () => {
  vi.mocked(api.tutorPro).mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in" },
  });
  mount();
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/signin", replace: true }));
  expect(screen.queryByRole("button", { name: "Manage teaching offers" })).toBeNull();
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
  await screen.findByText("Offline", { selector: "p.text-xs" });
  expect(screen.getByText("Offline", { selector: "p.text-xs" }).parentElement).toHaveTextContent(
    "1Offline",
  );
  expect(screen.getByText("Available").parentElement).toHaveTextContent("0Available");
});
