import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentCheckout } from "@/components/payment-checkout";
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows server disclosures and honest disabled checkout without loading a payment script", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input).endsWith("/policy")
      ? json({
          policy: {
            version: "access-v1",
            amount_paise: 59900,
            currency: "INR",
            access_days: 30,
            matching_hours: 72,
          },
          checkout_available: false,
          disclosures: null,
        })
      : json({ purchase: null }),
  );
  render(
    <PaymentCheckout
      listing={{ id: "11111111-1111-4111-8111-111111111111", revision: 1 }}
      learnerId="learner"
    />,
  );
  expect(await screen.findByText(/Access Pass purchases are not available yet/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Pay/ })).toBeNull();
  expect(document.querySelector('script[src*="razorpay"]')).toBeNull();
});

const disclosures = {
  merchant: "Fictional test merchant",
  invoice_notice: "Test transaction only. No tax invoice.",
  base_paise: 59900,
  tax_paise: 0,
  test_only: true,
};
const policy = {
  policy: {
    version: "access-v1",
    amount_paise: 59900,
    currency: "INR",
    access_days: 30,
    matching_hours: 72,
  },
  checkout_available: true,
  disclosures,
};
const readyPurchase = {
  id: "purchase-fixture",
  status: "ORDER_READY",
  policy_version: "access-v1",
  amount_paise: 59900,
  currency: "INR",
  created_at: "2026-10-15T04:00:00Z",
  captured_at: null,
  matching_deadline: null,
  resolution_required: false,
  payment_attempt_failed: false,
  access_active: false,
  disclosures,
  journal: [],
  checkout: {
    key_id: "rzp_test_fixture",
    order_id: "order_fixture",
    amount: 59900,
    currency: "INR",
    merchant: disclosures.merchant,
  },
};
it("resumes an uncertain purchase without exposing a replacement Pay button", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input).endsWith("/policy")
      ? json(policy)
      : String(input).endsWith("/current")
        ? json({ purchase: { id: "purchase-fixture" } })
        : json({ purchase: { ...readyPurchase, status: "UNKNOWN", checkout: null } }),
  );
  render(<PaymentCheckout listing={{ id: "listing", revision: 1 }} learnerId="learner" />);
  expect(await screen.findByText("Payment status uncertain")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Pay|Resume same/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Check payment status" })).toBeTruthy();
});
it("opens server-priced hosted checkout and keeps a successful browser callback pending until server confirmation", async () => {
  let onSuccess:
    | ((input: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => void)
    | undefined;
  const open = vi.fn();
  class Hosted {
    constructor(options: any) {
      expect(options.amount).toBe(59900);
      expect(options.order_id).toBe("order_fixture");
      onSuccess = options.handler;
    }
    open = open;
    on() {}
  }
  window.Razorpay = Hosted;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    String(input).endsWith("/policy")
      ? json(policy)
      : String(input).endsWith("/current")
        ? json({ purchase: null })
        : String(input).endsWith("/confirmation")
          ? json({ purchase: { ...readyPurchase, status: "VERIFYING", checkout: null } })
          : json({ purchase: readyPurchase }),
  );
  render(<PaymentCheckout listing={{ id: "listing", revision: 1 }} learnerId="learner" />);
  const pay = await screen.findByRole("button", { name: /Pay .* securely/ });
  expect(pay.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(pay);
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  onSuccess?.({
    razorpay_order_id: "order_fixture",
    razorpay_payment_id: "pay_fixture",
    razorpay_signature: "signed",
  });
  expect(await screen.findByText("Payment verification pending")).toBeTruthy();
  expect(screen.queryByText("Payment confirmed")).toBeNull();
  expect(screen.queryByRole("button", { name: /Resume same/ })).toBeNull();
  delete window.Razorpay;
});
