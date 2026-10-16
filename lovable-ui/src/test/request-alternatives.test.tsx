import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { RequestAlternatives } from "@/components/request-alternatives";
import type { ContactRequest, PublicOffer } from "@/lib/api";
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires an explicit Tutor choice and enquiry submission while keeping the original learning intent", async () => {
  const offer = {
    title: "Physics with examples",
    description: "Learn Physics using worked examples.",
    domain_id: "school",
    subject_id: "physics",
    level_id: "class-10",
    curriculum_id: "cbse",
    language_ids: ["english"],
    currency: "INR" as const,
    teaching_mode: "ONLINE" as const,
    rate_paise: 50000,
    rate_unit: "HOUR" as const,
    trial_kind: "NONE" as const,
  };
  const original: ContactRequest = {
    id: "request-original",
    listing_id: "original",
    learner_id: "learner",
    learner_alias: "Learner",
    learner_usable: true,
    offer,
    learning_requirements: "Learn mechanics through worked examples",
    preferred_times: "Tuesday evening",
    status: "DECLINED",
    expires_at: "2026-10-18T08:00:00Z",
    created_at: "2026-10-15T08:00:00Z",
    server_time: "2026-10-15T08:00:00Z",
    reminder: null,
    request_policy_version: "contact-v1",
    connection_id: null,
    test_only: true,
  };
  const suggestion: PublicOffer = {
    id: "alternative",
    revision: 1,
    tutor: { display_name: "Suggested Tutor" },
    offer,
    available: true,
    evidence_labels: [],
    verification_disclaimer: "Evidence reviewed.",
  };
  const writes: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (init?.method === "POST") {
      writes.push(JSON.parse(String(init.body)));
      return json({
        request: { ...original, id: "replacement", status: "PENDING" },
        replayed: false,
      });
    }
    if (path.endsWith("/alternatives")) return json({ offers: [suggestion], next_cursor: null });
    if (path.endsWith("/catalogue")) return json({ domains: [], terms: [] });
    if (path.endsWith("/learners"))
      return json({
        profiles: [
          {
            id: "learner",
            kind: "ADULT",
            alias: "Learner",
            usable: true,
            learning_requirements: "Other profile default goals",
          },
        ],
      });
    if (path.endsWith("/request-access"))
      return json({
        can_request: true,
        pending_count: 0,
        pending_limit: 5,
        coverage: { status: "ACTIVE", expires_at: "2026-11-15T08:00:00Z", test_only: true },
      });
    return json({ user: { id: "payer" } });
  });
  const root = createRootRoute({ component: () => <RequestAlternatives request={original} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole("button", { name: "Find matching Tutors" }));
  expect(await screen.findByText("Suggested Tutor")).toBeTruthy();
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Choose this Tutor" }));
  const goals = await screen.findByLabelText("Learning requirements");
  expect((goals as HTMLTextAreaElement).value).toBe(original.learning_requirements);
  expect((screen.getByLabelText("Preferred times") as HTMLTextAreaElement).value).toBe(
    "Tuesday evening",
  );
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
  expect(await screen.findByText(/Your Contact Request is pending/)).toBeTruthy();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    listing_id: "alternative",
    learner_id: "learner",
    learning_requirements: original.learning_requirements,
  });
});
