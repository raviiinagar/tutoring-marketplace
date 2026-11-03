import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactRequestForm } from "@/components/contact-request-form";
import {
  api,
  type PublicOffer,
  type RequestAccess,
  type LearnerProfile,
  type User,
} from "@/lib/api";
import { enquiryTarget, enquiryTextError } from "@/lib/enquiry";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => <a href={to + (search ? "?" + new URLSearchParams(search) : "")}>{children}</a>,
}));
vi.mock("@/components/payment-checkout", () => ({
  PaymentCheckout: ({ onAccessChange }: { onAccessChange: () => Promise<void> }) => (
    <button type="button" onClick={() => void onAccessChange()}>
      Refresh confirmed access
    </button>
  ),
}));
const id = "11111111-1111-4111-8111-111111111111";
const listing: PublicOffer = {
  id,
  revision: 2,
  tutor: { display_name: "Fictional Asha" },
  available: true,
  evidence_labels: [],
  verification_disclaimer: "Identity review only",
  public_path: "/teachers/physics-" + id,
  offer: {
    title: "Physics with examples",
    description: "Guided lessons",
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
const user: User = {
  id: "payer",
  display_name: "Adult Learner",
  email: "learner@example.invalid",
  email_verified: true,
  roles: ["LEARNER"],
  created_at: "2026-11-03T00:00:00Z",
};
const learner: LearnerProfile = {
  id: "learner",
  kind: "ADULT",
  alias: "My learning",
  age_band: "ADULT",
  learning_requirements: "I want help understanding mechanics with worked examples.",
  status: "ACTIVE",
  usable: true,
  created_at: "2026-11-03T00:00:00Z",
  updated_at: "2026-11-03T00:00:00Z",
};
let access: RequestAccess;
const sent = () => ({
  id: "request",
  listing_id: id,
  learner_id: learner.id,
  learner_alias: learner.alias,
  learner_usable: true,
  offer: listing.offer,
  learning_requirements: learner.learning_requirements,
  preferred_times: "Tuesday evening IST",
  status: "PENDING" as const,
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  created_at: new Date().toISOString(),
  server_time: new Date().toISOString(),
  reminder: null,
  request_policy_version: "contact-v1",
  connection_id: null,
  test_only: true,
});
beforeEach(() => {
  access = {
    can_request: true,
    pending_count: 0,
    pending_limit: 5,
    request_policy_version: "contact-v1",
    request_ttl_hours: 72,
    checkout_available: false,
    reason: null,
    coverage: {
      id: "coupon",
      source: "COUPON",
      purchase_id: null,
      status: "MATCHING",
      starts_at: null,
      ends_at: null,
      expires_at: "2026-12-01T00:00:00Z",
      test_only: true,
    },
  };
  vi.spyOn(api, "me").mockResolvedValue({ ok: true, status: 200, data: { user } });
  vi.spyOn(api, "learners").mockResolvedValue({
    ok: true,
    status: 200,
    data: { profiles: [learner] },
  });
  vi.spyOn(api, "requestAccess").mockImplementation(async () => ({
    ok: true,
    status: 200,
    data: access,
  }));
  vi.spyOn(api, "sendContactRequest").mockImplementation(async () => ({
    ok: true,
    status: 201,
    data: { request: sent(), replayed: false },
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function prepare() {
  render(<ContactRequestForm listing={listing} />);
  const times = await screen.findByLabelText("Preferred times");
  fireEvent.change(times, { target: { value: "Tuesday evening IST" } });
  fireEvent.click(screen.getByRole("button", { name: "Review enquiry" }));
  await screen.findByRole("heading", { name: "Review your enquiry" });
}
it("prepares and edits without a request, then sends exactly the reviewed offer revision with coupon access", async () => {
  await prepare();
  expect(api.sendContactRequest).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Refresh confirmed access" })).toBeNull();
  expect(screen.getByText(/Coupon redeemed. No payment required/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
  expect((screen.getByLabelText("Preferred times") as HTMLTextAreaElement).value).toBe(
    "Tuesday evening IST",
  );
  fireEvent.click(screen.getByRole("button", { name: "Review enquiry" }));
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  await screen.findByText("Enquiry submitted to Fictional Asha.");
  expect(api.sendContactRequest).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.sendContactRequest).mock.calls[0]?.[0]).toMatchObject({
    listing_id: id,
    listing_revision: 2,
    learner_id: "learner",
    preferred_times: "Tuesday evening IST",
  });
  expect(screen.getByText("Status: PENDING")).toBeTruthy();
});
it("does not bypass missing access, and waits for the server to confirm coverage", async () => {
  const granted = access;
  access = { ...access, can_request: false, coverage: null, reason: "ACCESS_REQUIRED" };
  await prepare();
  expect(screen.getByRole("button", { name: "Send enquiry" }).hasAttribute("disabled")).toBe(true);
  expect(api.sendContactRequest).not.toHaveBeenCalled();
  access = granted;
  fireEvent.click(screen.getByRole("button", { name: "Refresh confirmed access" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send enquiry" }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  expect(api.sendContactRequest).not.toHaveBeenCalled();
});
it("keeps pending-limit and missing-Learner barriers without opening another checkout", async () => {
  access = { ...access, can_request: false, pending_count: 5, reason: "PENDING_LIMIT" };
  await prepare();
  expect(screen.getByText(/limit of 5 pending enquiries/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Refresh confirmed access" })).toBeNull();
  expect(screen.getByRole("button", { name: "Send enquiry" }).hasAttribute("disabled")).toBe(true);
  cleanup();
  vi.mocked(api.learners).mockResolvedValue({
    ok: true,
    status: 200,
    data: { profiles: [{ ...learner, usable: false }] },
  });
  render(<ContactRequestForm listing={listing} />);
  await screen.findByText(/Create a usable Learner profile first/);
  expect(screen.getByRole("button", { name: "Review enquiry" }).hasAttribute("disabled")).toBe(
    true,
  );
});
it("retries an ambiguous failure with the identical request key and does not show success early", async () => {
  vi.mocked(api.sendContactRequest).mockResolvedValueOnce({
    ok: false,
    error: { kind: "unavailable" },
  });
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  await waitFor(() => expect(api.sendContactRequest).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send enquiry" }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  expect(screen.queryByText(/Enquiry submitted/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  await screen.findByText(/Enquiry submitted/);
  expect(vi.mocked(api.sendContactRequest).mock.calls[0]?.[0]).toEqual(
    vi.mocked(api.sendContactRequest).mock.calls[1]?.[0],
  );
});
it("clears the private draft and selected Learner when the signed-in account changes", async () => {
  await prepare();
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, id: "other-payer" } },
  });
  vi.mocked(api.learners).mockResolvedValue({ ok: true, status: 200, data: { profiles: [] } });
  fireEvent(window, new Event("focus"));
  await screen.findByText(/Create a usable Learner profile first/);
  expect((screen.getByLabelText("Learning requirements") as HTMLTextAreaElement).value).toBe("");
  expect((screen.getByLabelText("Preferred times") as HTMLTextAreaElement).value).toBe("");
  expect(api.sendContactRequest).not.toHaveBeenCalled();
});
it("rejects external sign-in targets and personal contact text before review", () => {
  expect(enquiryTarget("physics-" + id)).toBe("physics-" + id);
  for (const target of [
    "https://evil.invalid/",
    "//evil.invalid/",
    "../account",
    "physics-" + id + "?x=1",
    "physics-" + id + "#secret",
  ])
    expect(enquiryTarget(target)).toBeUndefined();
  expect(enquiryTextError("Please reach me at someone@example.invalid", 20, 500)).toMatch(
    /Keep emails/,
  );
  expect(enquiryTextError("  too short  ", 20, 500)).toBeTruthy();
  expect(enquiryTextError(learner.learning_requirements, 20, 500)).toBeUndefined();
});
it("ignores an old account's in-flight result and sends only once on repeated clicks", async () => {
  let complete!: (value: Awaited<ReturnType<typeof api.sendContactRequest>>) => void;
  vi.mocked(api.sendContactRequest).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  fireEvent.click(screen.getByRole("button", { name: "Sending enquiry…" }));
  expect(api.sendContactRequest).toHaveBeenCalledTimes(1);
  vi.mocked(api.me).mockResolvedValue({
    ok: true,
    status: 200,
    data: { user: { ...user, id: "different-account" } },
  });
  vi.mocked(api.learners).mockResolvedValue({ ok: true, status: 200, data: { profiles: [] } });
  fireEvent(window, new Event("focus"));
  await screen.findByText(/Create a usable Learner profile first/);
  await act(async () =>
    complete({ ok: true, status: 201, data: { request: sent(), replayed: false } }),
  );
  expect(screen.queryByText(/Enquiry submitted/)).toBeNull();
});
