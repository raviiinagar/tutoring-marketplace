import { RefundPanel } from "./refund-panel";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { api, describeFailure, type TutorProState, type Purchase } from "@/lib/api";
import { Button } from "./ui/button";
import { Field, Notice, useSingleFlight } from "./account/ui";
import { loadCheckout } from "./payment-checkout";
export function TutorPro({ identityApproved }: { identityApproved: boolean }) {
  const [state, setState] = useState<TutorProState>(),
    [code, setCode] = useState(""),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const key = useRef(crypto.randomUUID());
  const { loading, run } = useSingleFlight();
  const load = async () => {
    const r = await api.tutorPro();
    if (r.ok) {
      setState(r.data);
      setError(undefined);
    } else setError(describeFailure(r.error));
  };
  useEffect(() => {
    void load();
  }, [identityApproved]);
  const pay = async (p: Purchase) => {
    if (!p.checkout) return;
    try {
      await loadCheckout();
      const c = p.checkout;
      const checkout = new window.Razorpay!({
        key: c.key_id,
        order_id: c.order_id,
        amount: c.amount,
        currency: c.currency,
        name: c.merchant,
        description: "Tutor Pro - 30 days (test)",
        handler: (result) => {
          void run(async () => {
            const response = await api.confirmPurchase(p.id, result);
            setNotice(
              "Payment submitted. Access starts only after server confirmation. Refresh status in a moment.",
            );
            if (!response.ok) setError(describeFailure(response.error));
            await load();
          });
        },
        modal: {
          ondismiss: () => {
            void load();
          },
        },
        theme: { color: "#E46C52" },
      });
      checkout.on("payment.failed", () => {
        setNotice("Payment was not completed. Check status before retrying.");
        void load();
      });
      checkout.open();
    } catch {
      setError("Checkout could not load. Your existing purchase is saved; refresh and retry it.");
    }
  };
  return (
    <section id="tutor-pro" className="onboarding-section space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-coral-strong">
            Optional upgrade
          </p>
          <h2 className="mt-1 text-xl font-semibold">Tutor Pro</h2>
        </div>
        <p className="text-2xl font-semibold">
          ₹600 <span className="text-sm font-normal text-muted-foreground">/ 30 days</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Your identity-approved profile is free. Tutor Pro unlocks teaching offers and, with your
        consent, your public email after an offer is published. Tuition is separate. One-time
        purchase; no automatic renewal.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}
      {state?.active ? (
        <>
          <Notice tone="success">
            Tutor Pro active until {new Date(state.active.ends_at).toLocaleString()}. Your 30-day
            period has started.
          </Notice>
          <Button asChild>
            <Link to="/tutor/listings">Manage teaching offers</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">
            {identityApproved ? "Ready for Tutor Pro" : "Complete identity approval first"}
          </p>
          {state?.purchase && (
            <Notice tone="info">
              Saved purchase: {state.purchase.status}.{" "}
              {state.purchase.resolution_required
                ? "Payment needs review. Contact support."
                : "Check this purchase before starting another."}
            </Notice>
          )}
          <Field
            label="Tutor Pro coupon (optional)"
            value={code}
            maxLength={32}
            disabled={loading || !!state?.purchase}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              key.current = crypto.randomUUID();
            }}
            hint="A valid 100% Tutor Pro code activates access without payment. Learner pass codes are separate."
          />
          <Button
            disabled={
              loading ||
              !identityApproved ||
              !!state?.purchase ||
              (!code.trim() && !state?.checkout_available)
            }
            onClick={() =>
              void run(async () => {
                setError(undefined);
                const r = await api.buyTutorPro(key.current, code.trim() || undefined);
                if (r.ok) {
                  if (r.data.promotion)
                    setNotice("Coupon redeemed. Tutor Pro is active; no payment collected.");
                  await load();
                  if (r.data.purchase?.checkout) await pay(r.data.purchase);
                } else setError(describeFailure(r.error));
              })
            }
          >
            {loading
              ? "Please wait…"
              : code.trim()
                ? "Apply code and activate"
                : "Continue to test payment"}
          </Button>
          {state?.purchase?.checkout && (
            <Button disabled={loading} onClick={() => void pay(state.purchase!)}>
              Continue saved test payment
            </Button>
          )}
          {!state?.checkout_available && (
            <p className="text-xs text-muted-foreground">
              Paid checkout is currently unavailable. A valid 100% Tutor Pro coupon can still be
              used.
            </p>
          )}
        </>
      )}
      <Button variant="outline" disabled={loading} onClick={() => void run(load)}>
        Refresh Pro status
      </Button>
      {state?.purchase && <RefundPanel purchaseId={state.purchase.id} onChange={load} />}
    </section>
  );
}
