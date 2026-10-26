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
it("restores uploaded documents without presenting a clean scan as approval", async () => {
  const view = mount();
  expect(await screen.findByText("2 documents uploaded")).toBeVisible();
  expect(screen.getByRole("button", { name: "Submit Tutor profile for review" })).toBeDisabled();
  const list = screen.getByRole("list", { name: "Uploaded documents" });
  expect(within(list).getAllByText(/Scan passed/)).toHaveLength(2);
  expect(screen.getByRole("option", { name: "Document 1 · PDF · 2 KB" })).toBeInTheDocument();
  expect(await screen.findByText("Photo: Uploaded — waiting for Trust review")).toBeVisible();
  view.unmount();
  mount();
  expect(await screen.findByText("2 documents uploaded")).toBeVisible();
  expect(screen.getByText(/Scan passed means/)).toHaveTextContent(
    "does not mean Trust has approved it",
  );
});
it("identifies invalid fields before sending a profile revision", async () => {
  const save = vi.spyOn(api, "saveTutor");
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Edit profile details" }));
  fireEvent.change(screen.getByLabelText("Biography"), { target: { value: "Too short" } });
  fireEvent.click(screen.getByRole("button", { name: "Save revised profile" }));
  expect(await screen.findByText(/Write at least 40 characters/)).toBeVisible();
  expect(screen.getByText("Tick the adult confirmation before saving.")).toBeVisible();
  expect(screen.getByLabelText("Biography")).toHaveAttribute("aria-invalid", "true");
  expect(save).not.toHaveBeenCalled();
});
it("unlocks submission only after both evidence entries and retains the submitted state", async () => {
  vi.spyOn(api, "tutorClaim").mockImplementation(async (kind) => {
    saved.claims.push(claim(kind, saved.claims.length));
    return { ok: true, status: 200, data: structuredClone(saved) };
  });
  const submit = vi.spyOn(api, "submitTutor").mockImplementation(async () => {
    saved.profile!.status = "SUBMITTED";
    return { ok: true, status: 200, data: structuredClone(saved) };
  });
  mount();
  await screen.findByText("2 documents uploaded");
  fireEvent.change(screen.getByLabelText("Claim description"), {
    target: { value: "Fictional identity document" },
  });
  fireEvent.change(screen.getByLabelText("Clean evidence"), { target: { value: docs[0]!.id } });
  fireEvent.click(screen.getByRole("button", { name: "Add claim" }));
  await waitFor(() => expect(screen.getByLabelText("Claim type")).toHaveValue("QUALIFICATION"));
  expect(screen.getByRole("button", { name: "Submit Tutor profile for review" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "subject-physics" } });
  fireEvent.change(screen.getByLabelText("Claim description"), {
    target: { value: "Fictional Physics qualification" },
  });
  fireEvent.change(screen.getByLabelText("Clean evidence"), { target: { value: docs[1]!.id } });
  fireEvent.click(screen.getByRole("button", { name: "Add claim" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit Tutor profile for review" })).toBeEnabled(),
  );
  expect(screen.getAllByText(/Saved — not submitted/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Submit Tutor profile for review" }));
  expect(await screen.findByRole("button", { name: "Profile already submitted" })).toBeDisabled();
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh review status" }));
  expect(await screen.findByText("Profile already submitted")).toBeDisabled();
});
