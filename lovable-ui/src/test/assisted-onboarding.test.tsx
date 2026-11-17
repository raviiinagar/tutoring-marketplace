import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, type OnboardingHelpRequest, type StaffOnboardingRequest } from "@/lib/api";
import { assistedTutorApi, ownTutorApi } from "@/lib/tutor-api";
import { TeamSetup } from "@/components/team-setup";
import { TutorOnboardingOperations } from "@/components/assisted-onboarding-staff";

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    createFileRoute: () => (options: unknown) => options,
    useNavigate: () => vi.fn(),
    Link: React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }
    >(({ to, children, ...props }, ref) => (
      <a ref={ref} href={to} {...props}>
        {children}
      </a>
    )),
  };
});

const consents = [
  "I am 18 or older.",
  "I allow the team to publish my profile.",
  "I allow my photo to be shown.",
];
const request: OnboardingHelpRequest = {
  id: "11111111-2222-4333-8444-555555555555",
  reference: "TM-111111",
  status: "OPEN",
  whatsapp_number: "+919000000001",
  note: null,
  revision: 1,
  created_at: "2026-11-14T10:00:00.000Z",
  updated_at: "2026-11-14T10:00:00.000Z",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
};
let calls: { url: string; method: string; body?: unknown }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(
        JSON.stringify({ code: "TUTOR_ROLE_REQUIRED", message: "Choose the Tutor role." }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {node}
    </QueryClientProvider>,
  );

it("staff calls mirror the Tutor's own routes for one request, and keep no private draft", async () => {
  const assisted = assistedTutorApi(request.id);
  const base = "/v1/staff/tutor-onboarding/" + request.id + "/as-tutor";
  await assisted.tutor();
  await assisted.listingAction("ad-1", 3, "SUBMIT");
  await assisted.uploadTutorPhoto("image/png", "AAAA");
  expect(calls.map((c) => [c.method, c.url.slice(c.url.indexOf("/v1/"))])).toEqual([
    ["GET", base + "/tutor"],
    ["POST", base + "/listings/ad-1/actions/PUBLISH"],
    ["POST", base + "/tutor/photo"],
  ]);
  expect(calls[2]!.body).toEqual({ media_type: "image/png", data: "AAAA", public_consent: true });
  expect(assisted.photoPreviewUrl("p-1")).toContain(base + "/tutor/photo/p-1");
  expect((await assisted.tutorOnboardingDraft()).ok).toBe(true);
  await assisted.saveTutorOnboardingDraft({ revision: 0, step: 1, data: {} as never });
  expect(calls).toHaveLength(3);
  // The Tutor's own calls are looked up when made, so they follow the account's API.
  const own = vi.spyOn(api, "tutor").mockResolvedValue({
    ok: true,
    status: 200,
    data: { profile: null, claims: [], evidence: [] },
  });
  await ownTutorApi.tutor();
  expect(own).toHaveBeenCalledTimes(1);
});

it("a Tutor sends their details with consent and gets a WhatsApp link quoting their reference", async () => {
  vi.spyOn(api, "onboardingHelp").mockResolvedValue({
    ok: true,
    status: 200,
    data: { policy: { consent_version: "v1", consents }, request: null },
  });
  const send = vi
    .spyOn(api, "requestOnboardingHelp")
    .mockResolvedValue({ ok: true, status: 201, data: { request } });
  const cancel = vi.spyOn(api, "cancelOnboardingHelp").mockResolvedValue({
    ok: true,
    status: 200,
    data: { request: { ...request, status: "CANCELLED", cancelled_by: "TUTOR" } },
  });
  wrap(<TeamSetup hasProfile={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Send my details to the team" }));
  fireEvent.change(screen.getByLabelText("Your WhatsApp number"), {
    target: { value: "+91 90000 00001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send to the team" }));
  expect(
    await screen.findByText("Tick each box to let the team set up your profile."),
  ).toBeVisible();
  expect(send).not.toHaveBeenCalled();
  for (const text of consents) fireEvent.click(screen.getByRole("checkbox", { name: text }));
  fireEvent.click(screen.getByRole("button", { name: "Send to the team" }));
  const panel = await screen.findByRole("region", { name: "Our team is setting up your profile" });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ whatsapp_number: "+91 90000 00001" }),
  );
  const whatsapp = within(panel).getByRole("link", { name: /WhatsApp/ });
  expect(whatsapp.getAttribute("href")).toContain("https://wa.me/918233598649?text=");
  expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain("TM-111111");
  fireEvent.click(within(panel).getByRole("button", { name: "I'd rather do it myself" }));
  fireEvent.click(within(panel).getByRole("button", { name: "Withdraw my request" }));
  await waitFor(() => expect(cancel).toHaveBeenCalled());
  expect(await screen.findByRole("button", { name: "Send my details to the team" })).toBeVisible();
});

it("Support staff claim a request and open the Tutor's own wizard acting for that Tutor", async () => {
  const row: StaffOnboardingRequest = {
    ...request,
    user_id: "tutor-1",
    display_name: "Fictional Tutor",
    email: "fixture@example.invalid",
    assigned_to: null,
    assignee_name: null,
    assigned_to_me: false,
    staff_note: null,
    consent_version: "assisted-onboarding-v1",
    consent_accepted_at: request.created_at,
  };
  vi.spyOn(api, "staffOnboardingRequests").mockResolvedValue({
    ok: true,
    status: 200,
    data: { requests: [row] },
  });
  const action = vi.spyOn(api, "staffOnboardingAction").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      request: {
        ...row,
        status: "IN_PROGRESS",
        assigned_to: "staff-1",
        assigned_to_me: true,
        revision: 2,
      },
    },
  });
  vi.spyOn(api, "catalogue").mockResolvedValue({
    ok: true,
    status: 200,
    data: { domains: [], terms: [] },
  });
  wrap(<TutorOnboardingOperations />);
  fireEvent.click(screen.getByRole("button", { name: "Load requests" }));
  const card = (await screen.findByText("fixture@example.invalid")).closest("li")!;
  expect(within(card).getByRole("link", { name: "+919000000001" })).toHaveAttribute(
    "href",
    "https://wa.me/919000000001",
  );
  fireEvent.click(within(card).getByRole("button", { name: "Claim" }));
  await waitFor(() => expect(action).toHaveBeenCalledWith(row.id, "CLAIM", 1, undefined));
  expect(await screen.findByText("Setting up a Tutor profile for")).toBeVisible();
  // The workspace reads the Tutor's profile through the staff route for this request.
  await waitFor(() =>
    expect(
      calls.some((c) => c.url.endsWith("/v1/staff/tutor-onboarding/" + row.id + "/as-tutor/tutor")),
    ).toBe(true),
  );
  expect(calls.some((c) => c.url.includes("/v1/me/"))).toBe(false);
});
