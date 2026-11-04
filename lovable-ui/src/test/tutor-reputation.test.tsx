import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProgressDetails, TutorProgression } from "@/components/tutor-progression";
import { RecommendationPage } from "@/components/tutor-recommendations";
import { StaffRecommendationsPage } from "@/components/staff-recommendations";
import { api, type User } from "@/lib/api";
import { reputationApi, type TutorProgress } from "@/lib/tutor-reputation-api";
const state = vi.hoisted(() => ({
  user: {
    id: "author-one",
    display_name: "Fictional Author",
    email: "author@example.invalid",
    email_verified: true,
    roles: ["TUTOR"],
    created_at: "2026-11-04",
  } as User,
}));
vi.mock("@/lib/tutor-dashboard", () => ({
  useTutorAccount: () => ({ user: state.user, error: undefined, anonymous: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/account/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui");
  return {
    ...actual,
    AuthShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  };
});
const progress: TutorProgress = {
  policy_version: "tutor-reputation-v1",
  level: "NEW",
  public_eligible: true,
  counts: {
    recommendations: 0,
    student_reviews: 0,
    positive_student_reviews: null,
    ratings_four_or_five: 0,
  },
  response_facts: { decisions: 0, mean_response_seconds: null, note: "Recorded decisions only" },
  criteria: {
    photo: { status: "NOT_MET", detail: "No approved portrait" },
    profile: { status: "MET", detail: "Eligible profile" },
    identity: { status: "MET", detail: "Adult identity approved" },
    diploma: { status: "NOT_MET", detail: "No diploma upload" },
    response_time: { status: "UNVERIFIED", detail: "Official response calculation unavailable" },
    interview: { status: "UNVERIFIED", detail: "Official interview unavailable" },
  },
  levels: [
    {
      id: "NEW",
      label: "New",
      awarded: true,
      requirements: ["Eligible public profile"],
      blocked_reason: null,
    },
    {
      id: "EXPERIENCED",
      label: "Experienced",
      awarded: false,
      requirements: ["Two published recommendations"],
      blocked_reason: "Two moderated recommendations needed",
    },
    {
      id: "SUPER_TEACHER",
      label: "Super Teacher",
      awarded: false,
      requirements: ["Help requires three reviews; terms say one"],
      blocked_reason: "Official criteria conflict",
    },
    {
      id: "AMBASSADOR",
      label: "Ambassador",
      awarded: false,
      requirements: ["Previous criteria and interview"],
      blocked_reason: "Interview rules unverified",
    },
  ],
  policy_conflicts: [],
  sources: [],
};
const clients: QueryClient[] = [];
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  state.user.roles = ["TUTOR"];
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
it("shows recorded counts and locks unverified higher levels without awarding Ambassador", () => {
  mount(<ProgressDetails progress={progress} />);
  expect(screen.getAllByText("Current level")).toHaveLength(1);
  expect(screen.getByText("Official criteria conflict")).toBeVisible();
  expect(screen.getByText("Interview rules unverified")).toBeVisible();
  expect(screen.getByText("Published recommendations")).toBeVisible();
  expect(screen.queryByText(/earnings/i)).not.toBeInTheDocument();
});
it("does not read Tutor progression for a non-Tutor", () => {
  state.user.roles = ["LEARNER"];
  const read = vi.spyOn(reputationApi, "progression");
  mount(<TutorProgression />);
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Tutor level")).not.toBeInTheDocument();
});
it("shows failed reads with retry instead of zero recommendations", async () => {
  vi.spyOn(reputationApi, "progression").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 503, code: "UNAVAILABLE", message: "Try again" },
  });
  mount(<TutorProgression />);
  expect(await screen.findByRole("button", { name: "Retry Tutor level" })).toBeVisible();
  expect(screen.queryByText("Published recommendations")).not.toBeInTheDocument();
});
it("submits an attested recommendation for review and shows durable pending status", async () => {
  const profileId = "30000000-0000-4000-8000-000000000003";
  vi.spyOn(api, "publicTutor").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      profile: {
        id: profileId,
        display_name: "Fictional Tutor",
        biography: "Patient subject explanations",
        subject_ids: ["subject-physics"],
        hourly_rate_paise: 50000,
        currency: "INR",
        identity_label: "Identity reviewed",
        expertise_label: "Self-declared",
        photo_url: null,
        contact: null,
        contact_status: "UNAVAILABLE",
        offers: [],
      },
    },
  });
  const authored = vi
    .spyOn(reputationApi, "authored")
    .mockResolvedValueOnce({ ok: true, status: 200, data: { recommendations: [] } })
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        recommendations: [
          {
            id: "recommendation-one",
            tutor_public_id: profileId,
            text: "A thoughtful Tutor who patiently explains difficult topics and encourages questions.",
            relationship: "COLLEAGUE",
            status: "PENDING",
            revision: 1,
            created_at: "2026-11-04",
            updated_at: "2026-11-04",
          },
        ],
      },
    });
  const submit = vi.spyOn(reputationApi, "submit").mockResolvedValue({
    ok: true,
    status: 201,
    data: { recommendation: { id: "recommendation-one", status: "PENDING", revision: 1 } },
  });
  mount(<RecommendationPage profileId={profileId} />);
  const button = await screen.findByRole("button", { name: "Submit recommendation for review" });
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("How do you know this Tutor?"), {
    target: { value: "COLLEAGUE" },
  });
  fireEvent.change(screen.getByLabelText("Your recommendation"), {
    target: {
      value: "A thoughtful Tutor who patiently explains difficult topics and encourages questions.",
    },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(profileId, {
      relationship: "COLLEAGUE",
      text: "A thoughtful Tutor who patiently explains difficult topics and encourages questions.",
      interaction_attested: true,
    }),
  );
  expect(await screen.findByText("Your recommendation: Awaiting review")).toBeVisible();
  expect(authored).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByRole("button", { name: "Submit recommendation for review" }),
  ).not.toBeInTheDocument();
});
it("staff decisions carry the inspected revision and an audited reason", async () => {
  const row = {
    id: "recommendation-one",
    tutor_id: "tutor-one",
    author_id: "author-two",
    relationship: "COLLEAGUE" as const,
    status: "PENDING" as const,
    revision: 7,
    created_at: "2026-11-04",
    updated_at: "2026-11-04",
    tutor_display_name: "Fictional Tutor",
    author_display_name: "Fictional Colleague",
    text: "Clear explanations and thoughtful support from this patient Tutor.",
  };
  vi.spyOn(reputationApi, "queue").mockResolvedValue({
    ok: true,
    status: 200,
    data: { recommendations: [row], policy: "Check privacy and relevance" },
  });
  const decide = vi.spyOn(reputationApi, "decide").mockResolvedValue({
    ok: true,
    status: 200,
    data: { recommendation: { id: row.id, status: "PUBLISHED", revision: 8 } },
  });
  mount(<StaffRecommendationsPage />);
  fireEvent.change(screen.getByLabelText("Reason for recommendation access"), {
    target: { value: "Review the pending endorsement" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load recommendation queue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Review recommendation" }));
  fireEvent.change(screen.getByLabelText("Reason for decision"), {
    target: { value: "Relevant and privacy compliant" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save recommendation decision" }));
  await waitFor(() =>
    expect(decide).toHaveBeenCalledWith(row.id, {
      revision: 7,
      outcome: "PUBLISH",
      reason: "Relevant and privacy compliant",
    }),
  );
});
