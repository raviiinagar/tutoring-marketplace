import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, type User } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
import { TutorOnboarding } from "@/components/tutor-onboarding";
import { TeamSetup } from "@/components/team-setup";
import { ReportPhotoButton } from "@/components/report-photo-button";
import { LearnerDashboard } from "@/components/learner-dashboard";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    useNavigate: () => navigate,
    useLocation: () => window.location.hash.slice(1),
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
vi.mock("@/components/account/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui");
  return {
    ...actual,
    AuthShell: ({ title, children }: { title: string; children: ReactNode }) => (
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    ),
  };
});

const tutor: User = {
  id: "fictional-tutor",
  display_name: "Fictional Tutor",
  email: "tutor@example.invalid",
  email_verified: true,
  roles: ["TUTOR"],
  roles_chosen: true,
  created_at: "2026-11-18",
};
const consents = ["I am 18 or older.", "I allow the team to publish my profile."];
const ok = <T,>(data: T) => ({ ok: true as const, status: 200, data });
const clients: QueryClient[] = [];
function mount(node: ReactNode, user: User = tutor) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(accountSessionKey, ok({ user }));
  clients.push(client);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  // Anything not mocked below behaves as an unreachable service.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 503 })),
  );
  vi.spyOn(api, "me").mockResolvedValue(ok({ user: tutor }));
  vi.spyOn(api, "tutor").mockResolvedValue(ok({ profile: null, claims: [], evidence: [] }));
  vi.spyOn(api, "tutorPolicy").mockResolvedValue(ok({}) as never);
  vi.spyOn(api, "catalogue").mockResolvedValue(ok({ domains: [], terms: [] }));
  vi.spyOn(api, "tutorOnboardingDraft").mockResolvedValue(ok({ draft: null }));
  vi.spyOn(api, "listings").mockResolvedValue(
    ok({ listings: [], eligible_subject_ids: [], tutor_pro_active: false }),
  );
  vi.spyOn(api, "onboardingHelp").mockResolvedValue(
    ok({ policy: { consent_version: "v1", consents }, request: null }),
  );
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  navigate.mockClear();
});

it("a new Tutor chooses between our team (recommended) and creating the ad themselves", async () => {
  mount(<TutorOnboarding />);
  expect(await screen.findByRole("heading", { name: "Become a Tutor", level: 1 })).toBeVisible();
  const team = screen.getByRole("region", { name: "Send to our team" });
  expect(team).toHaveTextContent("Recommended");
  expect(screen.getByRole("region", { name: "Create it myself" })).not.toHaveTextContent(
    "Recommended",
  );
  fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
  // The team form opens straight away, with no extra "send my details" step.
  expect(await screen.findByLabelText("Your WhatsApp number")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Send your details to our team" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Create it myself instead" }));
  expect(
    await screen.findByRole("heading", { name: "Create your teaching ad", level: 1 }),
  ).toBeVisible();
});

it("a Tutor who already started the one-form setup goes straight back to it", async () => {
  vi.mocked(api.tutorOnboardingDraft).mockResolvedValue(
    ok({ draft: { revision: 1, step: 0, data: { quick_setup: true } } }) as never,
  );
  mount(<TutorOnboarding />);
  expect(
    await screen.findByRole("heading", { name: "Create your teaching ad", level: 1 }),
  ).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Become a Tutor" })).toBeNull();
});

it("cancelling the team form returns to the choice", async () => {
  const cancel = vi.fn();
  mount(<TeamSetup hasProfile={false} startOpen onCancel={cancel} />);
  expect(await screen.findByLabelText("Your WhatsApp number")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});

it("reports a photo with a reason, and asks signed-out visitors to sign in", async () => {
  const report = vi
    .spyOn(api, "reportTutorPhoto")
    .mockResolvedValueOnce({
      ok: false,
      error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in" },
    })
    .mockResolvedValueOnce(ok({ reported: true }));
  mount(<ReportPhotoButton profileId="public-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Report photo" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByText("Choose a reason.")).toBeVisible();
  expect(report).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("radio", { name: "It is not this Tutor" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByRole("link", { name: "sign in" })).toHaveAttribute(
    "href",
    "/auth/signin",
  );
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByText("Thank you. Our team will review this photo.")).toBeVisible();
  expect(report).toHaveBeenLastCalledWith("public-1", "NOT_THE_TUTOR");
});

it("tells a Tutor reporting their own photo to change it in My Account", async () => {
  vi.spyOn(api, "reportTutorPhoto").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 409, code: "OWN_PHOTO", message: "Own photo" },
  });
  mount(<ReportPhotoButton profileId="public-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Report photo" }));
  fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
  fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  expect(await screen.findByText("This is your own photo. Change it in My Account.")).toBeVisible();
});

it("the learner dashboard sends a teaching-only account to its teaching dashboard", async () => {
  mount(<LearnerDashboard />);
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({ to: "/tutor/dashboard", replace: true }),
  );
});

it("once an ad is online, only the team result shows, never the offer to send details again", async () => {
  const done = {
    id: "11111111-2222-4333-8444-555555555555",
    reference: "TM-111111",
    status: "COMPLETED" as const,
    whatsapp_number: "+919000000001",
    note: null,
    revision: 3,
    created_at: "2026-11-18T10:00:00.000Z",
    updated_at: "2026-11-18T11:00:00.000Z",
    completed_at: "2026-11-18T11:00:00.000Z",
    cancelled_at: null,
    cancelled_by: null,
  };
  vi.mocked(api.onboardingHelp).mockResolvedValue(
    ok({ policy: { consent_version: "v1", consents }, request: done }),
  );
  mount(<TeamSetup hasProfile adOnline />);
  expect(await screen.findByText(/Our team finished setting up your profile/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Send my details to the team" })).toBeNull();
  cleanup();
  vi.mocked(api.onboardingHelp).mockResolvedValue(
    ok({ policy: { consent_version: "v1", consents }, request: null }),
  );
  mount(<TeamSetup hasProfile adOnline />);
  await waitFor(() => expect(api.onboardingHelp).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Send my details to the team" })).toBeNull();
  expect(screen.queryByText(/Need help with your profile/)).toBeNull();
});
