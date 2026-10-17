import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MarketplaceMetricsDesk } from "@/components/marketplace-metrics";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires Finance MFA and a purpose, shows denominators, and clears a report after access expires", async () => {
  let expired = false;
  const row = {
    id: "school",
    label: "School education",
    available_offers: 3,
    available_tutors: 2,
    covered_subjects: 1,
    searches: 4,
    matched_searches: 3,
    empty_searches: 1,
    partial_searches: 0,
    requests: 2,
    responses: 1,
    acceptances: 1,
    declines: 0,
    cancelled: 0,
    connections: 1,
    mature_requests: 0,
    mature_responses: 0,
    mature_connections: 0,
    captured_purchases: 1,
    captured_paise: 59900,
    unexpected_capture_paise: 0,
    refund_intents: 0,
    confirmed_refunds: 0,
    refunded_paise: 0,
    chargeback_paise: 0,
    mature_paid_purchases: 0,
    mature_matched_purchases: 0,
    mature_refunded_purchases: 0,
    mature_response_rate: null,
    mature_connection_rate: null,
    mature_paid_match_rate: null,
    mature_paid_refund_rate: null,
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("/access")
      ? Response.json({ authenticated: true, scopes: ["FINANCE"], expires_at: null })
      : expired
        ? Response.json({ code: "STAFF_MFA_REQUIRED", message: "Verify MFA." }, { status: 403 })
        : Response.json({
            as_of: "2026-10-17T12:00:00Z",
            from: "2026-09-18",
            to: "2026-10-18",
            test_only: true,
            currency: "INR",
            domains: [row],
            definitions: { money: "Gross captures and provider refunds are separate facts." },
            unique_customers: null,
            estimated_teaching_outcomes: null,
          }),
  );
  render(<MarketplaceMetricsDesk />);
  const load = await screen.findByRole("button", { name: "Load marketplace report" });
  expect(load).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for report access"), {
    target: { value: "Review delivered matching value by domain" },
  });
  fireEvent.click(load);
  expect((await screen.findAllByText("School education")).length).toBe(3);
  expect(screen.getAllByText("Not yet measurable").length).toBeGreaterThan(0);
  expect(screen.getByText("Teaching outcomes and unique customers are not measured.")).toBeTruthy();
  expired = true;
  fireEvent.click(load);
  await waitFor(() => expect(screen.queryByText("School education")).toBeNull());
});
