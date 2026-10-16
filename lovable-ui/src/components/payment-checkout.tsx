import {RefundPanel} from './refund-panel';
import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import {
  api,
  describeFailure,
  type PaymentPolicy,
  type Purchase,
  type CheckoutConfirmation,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";

type CheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (result: CheckoutConfirmation) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
type HostedCheckout = {
  open: () => void;
  on: (event: "payment.failed", handler: () => void) => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => HostedCheckout;
  }
}
let script: Promise<void> | undefined;
async function loadCheckout() {
  if (window.Razorpay) return;
  script ??= new Promise<void>((resolve, reject) => {
    const element = document.createElement("script");
    element.src = "https://checkout.razorpay.com/v1/checkout.js";
    element.async = true;
    element.onload = () => resolve();
    element.onerror = () => {
      script = undefined;
      element.remove();
      reject(new Error("Checkout could not load"));
    };
    document.head.appendChild(element);
  });
  await script;
  if (!window.Razorpay) throw new Error("Checkout is unavailable");
}
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export function PaymentCheckout({
  listing,
  learnerId,
  onAccessChange,
}: {
  listing?: { id: string; revision: number };
  learnerId?: string;
  onAccessChange?: () => Promise<void>;
}) {
  const [policy, setPolicy] = useState<PaymentPolicy>();
  const [purchase, setPurchase] = useState<Purchase>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  const key = useRef(crypto.randomUUID());
  const { loading, run } = useSingleFlight();
  const refresh = useCallback(async () => {
    const current = await api.currentPurchase();
    if (!current.ok) {
      setError(describeFailure(current.error));
      return;
    }
    if (current.data.purchase) {
      const result = await api.purchase(current.data.purchase.id);
      if (result.ok) {
        setPurchase(result.data.purchase);
        setError(undefined);
        await onAccessChange?.();
      } else setError(describeFailure(result.error));
    }
  }, [onAccessChange]);
  useEffect(() => {
    let active = true;
    void api.paymentPolicy().then(async (result) => {
      if (!active) return;
      if (result.ok) setPolicy(result.data);
      else setError(describeFailure(result.error));
      await refresh();
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!purchase || !["CREATING", "VERIFYING"].includes(purchase.status)) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [purchase?.status, refresh]);
  const repurchasing =
    purchase?.access?.status === "EXPIRED" &&
    !!purchase.access.starts_at &&
    !purchase.resolution_required;
  useEffect(() => {
    setAccepted(false);
  }, [repurchasing, purchase?.id]);
  useEffect(() => {
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  const open = () =>
    void run(async () => {
      if (!policy?.checkout_available || !accepted) return;
      setError(undefined);
      setMessage(undefined);
      if (repurchasing) key.current = crypto.randomUUID();
      let current = repurchasing ? undefined : purchase;
      if (!current) {
        if (!listing || !learnerId) return;
        const created = await api.createPurchase({
          request_key: key.current,
          listing_id: listing.id,
          listing_revision: listing.revision,
          learner_id: learnerId,
          policy_version: policy.policy.version,
        });
        if (!created.ok) {
          setError(describeFailure(created.error));
          return;
        }
        current = created.data.purchase;
        setPurchase(current);
      } else {
        const latest = await api.purchase(current.id);
        if (!latest.ok) {
          setError(describeFailure(latest.error));
          return;
        }
        current = latest.data.purchase;
        setPurchase(current);
      }
      if (!current.checkout) return;
      try {
        await loadCheckout();
        const checkout = current.checkout;
        const id = current.id;
        const modal = new window.Razorpay!({
          key: checkout.key_id,
          order_id: checkout.order_id,
          amount: checkout.amount,
          currency: checkout.currency,
          name: checkout.merchant,
          description: "One-time Access Pass",
          theme: { color: "#e84d6d" },
          modal: {
            ondismiss: () => {
              setMessage(
                "Checkout closed. This does not confirm payment failure. Check this purchase before trying again.",
              );
              void refresh();
            },
          },
          handler: (result) => {
            setMessage("Checking payment with the provider. Your Access Pass has not started.");
            void api.confirmPurchase(id, result).then(async (confirmed) => {
              if (confirmed.ok) {
                setPurchase(confirmed.data.purchase);
                setError(undefined);
                await onAccessChange?.();
              } else setError(describeFailure(confirmed.error));
            });
          },
        });
        modal.on("payment.failed", () => {
          setMessage(
            "The payment attempt failed. Check its status before retrying this same checkout.",
          );
          void refresh();
        });
        modal.open();
      } catch {
        setError(
          "Secure checkout could not load. Refresh this purchase and retry the same checkout.",
        );
      }
    });
  const disclosure = repurchasing
    ? policy?.disclosures
    : purchase?.disclosures || policy?.disclosures;
  return (
    <section
      aria-label="Access Pass checkout"
      className="space-y-5 rounded-2xl border border-coral/20 bg-coral-soft/30 p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-coral-strong">
            One-time platform access
          </p>
          <h3 className="mt-2 text-xl font-semibold">Access Pass</h3>
        </div>
        <ShieldCheck aria-hidden className="size-6 shrink-0 text-coral-strong" />
      </div>
      {!ready ? (
        <p role="status">Checking checkout availability…</p>
      ) : (
        <>
          {policy && (
            <>
              <p className="text-3xl font-semibold">
                {money(
                  repurchasing
                    ? policy.policy.amount_paise
                    : (purchase?.amount_paise ?? policy.policy.amount_paise),
                )}{" "}
                <span className="text-sm font-normal text-muted-foreground">total</span>
              </p>
              <p className="text-sm leading-relaxed">
                Connect with Tutors through a 30-day pass. Your access period starts after confirmed
                payment and the first eligible Tutor acceptance. Tuition and trial fees are paid
                directly to the Tutor.
              </p>
              <p className="text-sm text-muted-foreground">
                No automatic renewal. The first matching deadline is 72 hours from payment capture.
                No eligible match within that period qualifies for a full platform-fee refund.
              </p>
            </>
          )}
          {disclosure && (
            <div className="space-y-1 rounded-xl bg-background/80 p-4 text-sm">
              <p className="font-semibold">{disclosure.merchant}</p>
              <p>
                Platform fee: {money(disclosure.base_paise)} · Tax: {money(disclosure.tax_paise)}
              </p>
              <p className="text-muted-foreground">{disclosure.invoice_notice}</p>
              {disclosure.test_only && (
                <p className="font-semibold text-coral-strong">Test mode — no real money.</p>
              )}
            </div>
          )}
          {purchase && (
            <div role="status" className="space-y-2 text-sm">
              <p className="font-semibold">
                {purchase.status === "CAPTURED"
                  ? "Payment confirmed"
                  : purchase.status === "VERIFYING"
                    ? "Payment verification pending"
                    : purchase.status === "UNKNOWN"
                      ? "Payment status uncertain"
                      : purchase.status === "REVIEW"
                        ? "Payment needs review"
                        : purchase.status === "CREATING"
                          ? "Preparing checkout"
                          : purchase.payment_attempt_failed
                            ? "Payment attempt failed"
                            : "Checkout ready"}
              </p>
              <p>
                {purchase.status === "CAPTURED"
                  ? purchase.access?.status === "ACTIVE"
                    ? "Your Access Pass is active."
                    : purchase.access?.status === "EXPIRED"
                      ? purchase.access.starts_at
                        ? "Your Access Pass has expired. Existing Connections remain available, subject to current safety permissions."
                        : "The matching window has ended. Your pass did not start; resolution is pending."
                      : purchase.access?.status === "UNAVAILABLE"
                        ? "New enquiries are unavailable for this purchase. Check its payment status before paying again."
                        : "Send an enquiry to an eligible Tutor. Your 30-day access period begins with the first eligible acceptance."
                  : purchase.status === "UNKNOWN" ||
                      purchase.status === "VERIFYING" ||
                      purchase.status === "CREATING"
                    ? "Keep this purchase. Do not start another payment while verification is pending."
                    : purchase.status === "REVIEW"
                      ? "Your payment needs reconciliation. Do not pay again."
                      : !purchase.checkout
                        ? "The selected Tutor or Learner profile is currently unavailable for checkout."
                        : "You can resume the same checkout without creating another purchase."}
              </p>
              {purchase.access?.starts_at && (
                <p>Access started: {new Date(purchase.access.starts_at).toLocaleString()}</p>
              )}
              {purchase.access?.ends_at && (
                <p>Access ends: {new Date(purchase.access.ends_at).toLocaleString()}</p>
              )}
              {purchase.access?.status === "MATCHING" && (
                <p>Awaiting Tutor acceptance. Your pass has not started.</p>
              )}
              {purchase.requires_alternative && (
                <p>
                  The selected Tutor or Learner profile is unavailable. Choose another eligible
                  offer/profile within the existing matching window.
                </p>
              )}
              {purchase.status === "CAPTURED" && (
                <a href="/tutors" className="link inline-block">
                  Find Tutors to send an enquiry
                </a>
              )}
              {purchase.matching_deadline && !purchase.access?.starts_at && (
                <p>Matching deadline: {new Date(purchase.matching_deadline).toLocaleString()}</p>
              )}
              {purchase.resolution_required && (
                <p>This payment requires resolution. A refund has not been confirmed.</p>
              )}
              <p className="break-all text-xs text-muted-foreground">
                Purchase reference: {purchase.id}
              </p>
              <RefundPanel purchaseId={purchase.id} onChange={refresh}/>
            </div>
          )}
          {!policy?.checkout_available && (
            <p className="text-sm text-muted-foreground">
              Access Pass purchases are not available yet. Browsing Tutors is free.
            </p>
          )}
          {message && <Notice tone="info">{message}</Notice>}
          {policy?.checkout_available &&
            (!purchase || purchase.checkout || (repurchasing && listing && learnerId)) && (
              <>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    className="mt-1 size-4 shrink-0 accent-coral-strong"
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                  />
                  I understand that the Access Pass is a separate platform charge and tuition is
                  paid directly to Tutors.
                </label>
                <Button
                  type="button"
                  className="w-full rounded-full sm:w-auto"
                  disabled={
                    loading ||
                    !accepted ||
                    ((!purchase || repurchasing) && (!listing || !learnerId))
                  }
                  onClick={open}
                >
                  <CreditCard aria-hidden className="mr-2 size-4" />
                  {loading
                    ? "Preparing secure checkout…"
                    : purchase && !repurchasing
                      ? "Resume same checkout"
                      : "Pay " + money(policy.policy.amount_paise) + " securely"}
                </Button>
              </>
            )}
          {purchase && (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void run(refresh)}
            >
              Check payment status
            </Button>
          )}
          {!purchase && !listing && (
            <p className="text-sm text-muted-foreground">
              Choose an available Tutor and a usable Learner profile to review checkout.
            </p>
          )}
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
