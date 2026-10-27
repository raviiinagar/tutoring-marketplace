import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentCheckout } from "@/components/payment-checkout";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows the existing coupon-funded pass instead of another full-price checkout", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    String(input).endsWith("/policy")
      ? json(policy)
      : String(input).endsWith("/request-access")
        ? json({
            coverage: { source: "COUPON", status: "ACTIVE", expires_at: "2026-11-27T04:00:00Z" },
          })
        : json({ purchase: null }),
  );
  render(<PaymentCheckout />);
  expect(await screen.findByText("Access Pass active · Fully covered by coupon")).toBeTruthy();
  expect(screen.queryByText(/₹599/)).toBeNull();
  expect(screen.queryByRole("button", { name: /Pay / })).toBeNull();
});
const policy = {
  policy: {
    version: "access-v1",
    amount_paise: 59900,
    currency: "INR",
    access_days: 30,
    matching_hours: 72,
  },
  checkout_available: false,
  disclosures: null,
};
it("redeems a full coupon when paid checkout is disabled without loading Razorpay", async () => {
  let submitted: { coupon_code?: string; amount_paise?: number } = {};
  const changed = vi.fn(async () => {});
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/policy")) return json(policy);
    if (url.endsWith("/current")) return json({ purchase: null });
    if (url.endsWith("/quote"))
      return json({
        quote: {
          code: "BETA100",
          base_paise: 59900,
          discount_paise: 59900,
          total_paise: 0,
          percent_off: 100,
          payment_required: false,
        },
      });
    submitted = JSON.parse(String(init?.body));
    return json({
      purchase: null,
      promotion: { id: "redemption", code: "BETA100", total_paise: 0 },
    });
  });
  render(
    <PaymentCheckout
      listing={{ id: "listing", revision: 1 }}
      learnerId="learner"
      onAccessChange={changed}
    />,
  );
  const field = await screen.findByLabelText("Coupon code");
  fireEvent.change(field, { target: { value: "beta100" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply coupon" }));
  expect(await screen.findByText("No payment required. No card or UPI needed.")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Redeem coupon · ₹0" }));
  expect(await screen.findByText(/Coupon redeemed and saved/)).toBeTruthy();
  expect(submitted.coupon_code).toBe("BETA100");
  expect(submitted.amount_paise).toBeUndefined();
  expect(changed).toHaveBeenCalled();
  expect(document.querySelector('script[src*="razorpay"]')).toBeNull();
});
it("invalidates an applied coupon when edited and explains a rejected code", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/policy")) return json(policy);
    if (url.endsWith("/current")) return json({ purchase: null });
    return json({ code: "COUPON_UNAVAILABLE", message: "This coupon has expired." }, 409);
  });
  render(<PaymentCheckout listing={{ id: "listing", revision: 1 }} learnerId="learner" />);
  fireEvent.change(await screen.findByLabelText("Coupon code"), { target: { value: "EXPIRED" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply coupon" }));
  expect(await screen.findByText("This coupon has expired.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Redeem coupon · ₹0" })).toBeNull();
});
