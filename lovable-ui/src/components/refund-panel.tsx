import { RefundCasePanel } from "./refund-cases";
import { useCallback, useEffect, useState } from "react";
import { api, describeFailure, type RefundState } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";
const labels: Record<string, string> = {
  WAITING_RESERVE: "Refund requested — waiting for funded reserve",
  RESERVED: "Refund funds reserved",
  SENDING: "Submitting refund to payment provider",
  UNKNOWN: "Provider result unknown — being reconciled",
  PENDING: "Payment provider is processing your refund",
  PROCESSED: "Refund processed",
  FAILED: "Provider refund failed — Finance follow-up required",
  REVIEW: "Refund needs Finance review",
};
export function RefundPanel({
  purchaseId,
  onChange,
}: {
  purchaseId: string;
  onChange?: () => void | Promise<void>;
}) {
  const [state, setState] = useState<RefundState>();
  const [error, setError] = useState<string>();
  const action = useSingleFlight();
  const load = useCallback(async () => {
    const r = await api.refunds(purchaseId);
    if (r.ok) {
      setState(r.data);
      setError(undefined);
    } else setError(describeFailure(r.error));
  }, [purchaseId]);
  useEffect(() => {
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load]);
  const cancel = () =>
    action.run(async () => {
      setError(undefined);
      const r = await api.cancelPurchase(purchaseId);
      if (r.ok) {
        setState(r.data);
        await onChange?.();
      } else setError(describeFailure(r.error));
    });
  return (
    <section className="mt-5 space-y-4 border-t pt-5" aria-label="Cancellation and refunds">
      <h3 className="font-semibold">Cancellation and refunds</h3>
      {error && <Notice tone="error">{error}</Notice>}
      {state?.can_cancel && (
        <>
          <p className="text-sm text-muted-foreground">
            Cancel before the first eligible Tutor acceptance. Pending enquiries end immediately;
            any captured platform fee is queued for a full refund.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={action.loading}
            onClick={() => void cancel()}
          >
            Cancel unactivated purchase
          </Button>
        </>
      )}
      {state?.cancelled && (
        <Notice tone="info">
          Purchase cancelled. New enquiries cannot use this purchase. Captured money and refund
          progress are shown separately.
        </Notice>
      )}
      {state?.refunds.map((row) => (
        <article key={row.id} className="rounded-xl border p-4 text-sm">
          <p className="font-semibold">{labels[row.status] || row.status}</p>
          <p className="mt-2">
            ₹{(row.amount_paise / 100).toFixed(2)} · Full approved amount; gateway costs are not
            deducted.
          </p>
          {row.provider_refund_id && (
            <p className="mt-2 break-all text-xs">Provider refund: {row.provider_refund_id}</p>
          )}
          <p className="mt-2 break-all text-xs text-muted-foreground">Refund reference: {row.id}</p>
        </article>
      ))}
      {state?.cancelled && !state.refunds.length && (
        <p className="text-sm">
          No confirmed capture has been recorded yet. Any late captured payment will be reconciled
          and refunded.
        </p>
      )}
      <p className="text-xs text-muted-foreground">{state?.bank_notice}</p>
      {state?.can_review && <RefundCasePanel purchaseId={purchaseId} />}
      <Button type="button" variant="outline" disabled={action.loading} onClick={() => void load()}>
        Refresh refund status
      </Button>
    </section>
  );
}
