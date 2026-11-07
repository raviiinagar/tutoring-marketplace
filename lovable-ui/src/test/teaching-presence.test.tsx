import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type User } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
import { landingAfterSignIn, summarizeListings } from "@/lib/teaching-presence";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { TutorWorkspaceNavigation } from "@/components/tutor-workspace-navigation";
import { TeachingCard } from "@/components/teaching-card";

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useNavigate: () => vi.fn(),
    Link: React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }
    >(({ to, children, ...props }, ref) => {
      const { activeProps: _a, activeOptions: _o, ...rest } = props as Record<string, unknown>;
      return (
        <a ref={ref} href={to} {...(rest as object)}>
          {children}
        </a>
      );
    }),
  };
});

const learner: User = {
  id: "u1",
  display_name: "Learner",
  email: "l@example.invalid",
  email_verified: true,
  created_at: "2026-11-03",
  roles: ["LEARNER"],
};
const tutor: User = { ...learner, id: "u2", roles: ["LEARNER", "TUTOR"] };
const ad = (status: string, eligible = true) =>
  ({ status, eligible }) as Parameters<typeof summarizeListings>[0][number];

function mount(user: User, ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(accountSessionKey, { ok: true, data: { user } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const listingsOf = (items: ReturnType<typeof ad>[]) =>
  vi.spyOn(api, "listings").mockResolvedValue({ ok: true, data: { listings: items } } as never);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("summarises ads: only published and eligible ads are online", () => {
  expect(
    summarizeListings([
      ad("PUBLISHED"),
      ad("PUBLISHED", false),
      ad("DRAFT"),
      ad("REVIEW"),
      ad("PAUSED"),
    ]),
  ).toEqual({ total: 5, online: 1, drafts: 2, offline: 2 });
  expect(summarizeListings([])).toEqual({ total: 0, online: 0, drafts: 0, offline: 0 });
});

it("never loads ads for an account without the Tutor role", async () => {
  const spy = listingsOf([ad("DRAFT")]);
  mount(learner, <WorkspaceNavigation />);
  expect(screen.queryByRole("link", { name: "My ads" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Switch to teaching" })).toBeNull();
  expect(spy).not.toHaveBeenCalled();
});

it("shows the teaching tabs as soon as any ad exists, a private draft included", async () => {
  listingsOf([ad("DRAFT")]);
  mount(tutor, <WorkspaceNavigation />);
  expect(await screen.findByRole("link", { name: "My ads" })).toHaveProperty("href");
  expect(screen.getByRole("link", { name: "Evaluations" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Switch to teaching" })).toBeTruthy();
});

it("keeps the learner tabs for a tutor with no ads", async () => {
  const spy = listingsOf([]);
  mount(tutor, <WorkspaceNavigation />);
  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(screen.queryByRole("link", { name: "My ads" })).toBeNull();
  expect(screen.getByRole("link", { name: "Switch to teaching" })).toBeTruthy();
});

it("offers a way back to learning from the teaching navigation", () => {
  mount(tutor, <TutorWorkspaceNavigation />);
  expect(screen.getByRole("link", { name: "Switch to learning" }).getAttribute("href")).toBe(
    "/account",
  );
});

it("lands on the teaching dashboard only for accounts that own an ad", async () => {
  listingsOf([ad("DRAFT")]);
  expect(await landingAfterSignIn(tutor)).toBe("/tutor/dashboard");
  vi.restoreAllMocks();
  listingsOf([]);
  expect(await landingAfterSignIn(tutor)).toBe("/account");
  vi.restoreAllMocks();
  const spy = listingsOf([ad("PUBLISHED")]);
  expect(await landingAfterSignIn(learner)).toBe("/account");
  expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.spyOn(api, "listings").mockRejectedValue(new Error("offline"));
  expect(await landingAfterSignIn(tutor)).toBe("/account");
});

it("teaching card: drafts only means nothing is public", async () => {
  listingsOf([ad("DRAFT"), ad("DRAFT")]);
  mount(tutor, <TeachingCard />);
  expect(await screen.findByText("0 online · 2 draft · 0 offline")).toBeTruthy();
  expect(screen.getByText(/Nothing is published yet/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Manage ads" })).toBeTruthy();
});

it("teaching card: counts published ads and invites the first ad when empty", async () => {
  listingsOf([ad("PUBLISHED")]);
  mount(tutor, <TeachingCard />);
  expect(await screen.findByText("1 ad is published and visible to learners.")).toBeTruthy();
  cleanup();
  vi.restoreAllMocks();
  listingsOf([]);
  mount(tutor, <TeachingCard />);
  expect(await screen.findByRole("link", { name: "Create your first ad" })).toBeTruthy();
});

it("teaching card renders nothing for a learner", () => {
  const { container } = mount(learner, <TeachingCard />);
  expect(container.textContent).toBe("");
});
