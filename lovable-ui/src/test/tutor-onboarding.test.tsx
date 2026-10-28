import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type TutorState, type TutorClaim } from "@/lib/api";
import { TutorOnboarding } from "@/components/tutor-onboarding";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
const profile = {
  display_name: "Fictional Tutor",
  biography: "I teach Physics using worked examples and patient explanations.",
  birth_date: "1995-01-01",
  public_id: "44444444-4444-4444-8444-444444444444",
  public_revision: 1,
  onboarding_version: 2,
  subject_ids: ["subject-physics"],
  hourly_rate_paise: 50000,
  identity_country: "IN" as const,
  identity_document: "AADHAAR" as const,
  public_email_consent: false,
  revision: 1,
  status: "DRAFT",
  eligible: false,
};
const docs = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    media_type: "application/pdf",
    byte_length: 2048,
    scan_status: "CLEAN" as const,
    test_only: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    media_type: "application/pdf",
    byte_length: 3072,
    scan_status: "CLEAN" as const,
    test_only: true,
  },
];
const claim = (kind: TutorClaim["kind"], index: number): TutorClaim => ({
  id: `claim-${index}`,
  kind,
  subject_id: kind === "IDENTITY" ? null : "subject-physics",
  description:
    kind === "IDENTITY" ? "Fictional identity document" : "Fictional Physics qualification",
  evidence_id: docs[index]!.id,
  status: "PENDING",
  reviewed_by: null,
  reviewed_at: null,
  expires_at: null,
  review_reason: null,
  reviewed_check: null,
});
let saved: TutorState;
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TutorOnboarding />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  saved = { profile: { ...profile }, evidence: [...docs], claims: [] };
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
  vi.spyOn(api, "tutor").mockImplementation(async () => ({
    ok: true,
    status: 200,
    data: structuredClone(saved),
  }));
  vi.spyOn(api, "tutorPolicy").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      uploads_enabled: true,
      test_only: true,
      max_bytes: 1048576,
      media_types: ["application/pdf"],
    },
  });
  vi.spyOn(api, "catalogue").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      domains: [],
      terms: [
        {
          id: "subject-physics",
          kind: "SUBJECT",
          label: "Physics",
          active: true,
          aliases: [],
          domain_ids: [],
        },
      ],
    },
  });
  vi.spyOn(api, "tutorPhoto").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      photo: {
        id: "portrait",
        status: "PENDING",
        scan_status: "CLEAN",
        test_only: true,
        review_reason: null,
      },
      policy: {
        uploads_enabled: true,
        test_only: true,
        max_bytes: 1048576,
        media_types: ["image/png"],
        notice: "Upload your own adult portrait.",
      },
    },
  });
  vi.spyOn(api, "me").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Sign in." },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows a short saved profile and a single ID action without qualification or date-of-birth steps", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "1. About you" })).toBeVisible();
  expect(screen.getByText(/Subjects, skills and experience are self-declared/)).toBeVisible();
  expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add claim" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit fictional ID sample" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Continue to test payment" })).toBeDisabled();
});
it("one upload automatically submits identity and restores scan and pending review status after reload", async () => {
  vi.spyOn(api, "submitTutorIdentity").mockImplementation(async () => {
    saved = {
      ...saved,
      profile: { ...profile, status: "SUBMITTED" },
      claims: [claim("IDENTITY", 0)],
    };
    return { ok: true, status: 200, data: structuredClone(saved) };
  });
  const view = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Submit fictional ID sample" }));
  expect(
    await screen.findByText(/ID uploaded, scan passed, and submitted for Trust review/),
  ).toBeVisible();
  expect(screen.getByText("Waiting for review")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Submit fictional ID sample" }),
  ).not.toBeInTheDocument();
  view.unmount();
  mount();
  expect(await screen.findByText("Waiting for review")).toBeVisible();
  expect(screen.getByText("Scan passed", { exact: false })).toBeVisible();
});
it("approved identity has a public-profile link while Tutor Pro stays a separate optional step", async () => {
  saved = {
    ...saved,
    profile: { ...profile, status: "APPROVED", eligible: true },
    claims: [{ ...claim("IDENTITY", 0), status: "APPROVED" }],
  };
  mount();
  expect(await screen.findByRole("link", { name: "View your public profile" })).toBeVisible();
  expect(
    screen.getByText(/Your profile can appear publicly without a pass or teaching offer/),
  ).toBeVisible();
  expect(screen.getByLabelText("Tutor Pro coupon (optional)")).toBeEnabled();
});
it("profile editing names the public email consent and avoids a compulsory portrait or qualification document", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
  expect(screen.getByLabelText(/Show my verified email publicly to everyone/)).not.toBeChecked();
  expect(screen.getByRole("group", { name: "Subjects you teach" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Date of birth")).not.toBeInTheDocument();
  expect(screen.getByText("Public profile photo · optional")).toBeVisible();
  expect(screen.getByText(/No qualification document required/)).toBeVisible();
});
