import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RefundPanel } from "@/components/refund-panel";
import { RefundCasePanel } from "@/components/refund-cases";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("submits an explicit review without submitting a surrounding enquiry form", async () => {
  const outer = vi.fn((e: {preventDefault():void}) => e.preventDefault());
  let writes = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    if (init?.method === "POST") writes++;
    return new Response(JSON.stringify({ cases: [], case: { id: "case" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  render(
    <form onSubmit={outer}>
      <RefundCasePanel purchaseId="purchase" />
    </form>,
  );
  fireEvent.change(await screen.findByLabelText("Refund review reason"), {
    target: { value: "Please review this fictional connection fee adjustment" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit refund review" }));
  await screen.findByRole("button", { name: "Refresh refund reviews" });
  expect(writes).toBe(1);
  expect(outer).not.toHaveBeenCalled();
});
it("only cancels on an explicit action and distinguishes unknown refund results from bank credit", async () => {
  let cancelled = false;
  let writes = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    if (init?.method === "POST") {
      writes++;
      cancelled = true;
    }
    return new Response(
      JSON.stringify({
        cancelled,
        can_cancel: !cancelled,
        refunds: cancelled
          ? [
              {
                id: "refund",
                status: "UNKNOWN",
                amount_paise: 59900,
                currency: "INR",
                last_error: "PROVIDER_RESULT_UNKNOWN",
              },
            ]
          : [],
        bank_notice: "Bank credit timing depends on your payment method and bank.",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  render(<RefundPanel purchaseId="purchase" />);
  const button = await screen.findByRole("button", { name: "Cancel unactivated purchase" });
  expect(writes).toBe(0);
  fireEvent.click(button);
  expect(await screen.findByText("Provider result unknown — being reconciled")).toBeTruthy();
  expect(screen.getByText(/₹599.00/)).toBeTruthy();
  expect(writes).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh refund status" }));
  expect(writes).toBe(1);
  expect(screen.queryByText("Refund processed")).toBeNull();
});
