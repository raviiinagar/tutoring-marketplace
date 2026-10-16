import { FinanceReconciliation } from "@/components/finance-reconciliation";
import { FinanceReviews } from "@/components/refund-cases";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api, describeFailure, type RefundOperation } from "@/lib/api";
import { AuthShell, Field, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/staff_/finance")({
  ssr: false,
  component: Finance,
  head: () => ({
    meta: [
      { title: "Finance operations — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Finance() {
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [queue, setQueue] = useState<(RefundOperation & { cycle_id: string })[]>();
  const [reserve, setReserve] = useState<
    { currency: string; confirmed_paise: string; reserved_paise: string; spent_paise: string }[]
  >([]);
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.refundQueue(reason);
    if (r.ok) {
      setQueue(r.data.refunds);
      setReserve(r.data.reserves);
    } else setError(describeFailure(r.error));
  };
  const inspect = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      setError(undefined);
      await load();
    });
  };
  const fund = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      setError(undefined);
      setNotice(undefined);
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(value * 100)) {
        setError("Enter an exact positive amount with at most two decimal places.");
        return;
      }
      const r = await api.fundRefundReserve({ reference, amount_paise: value * 100, reason });
      if (r.ok) {
        setNotice("Verified reserve funding recorded. This entry does not transfer money.");
        setReference("");
        setAmount("");
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <AuthShell
      title="Finance operations"
      intro="Finance scope and active staff MFA are required. Record a purpose before inspecting refund operations."
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <form onSubmit={inspect} className="space-y-4">
        <Field
          label="Finance access reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={240}
          required
        />
        <Button disabled={action.loading}>Inspect refund queue</Button>
      </form>
      {queue && (
        <>
          <FinanceReviews purpose={reason} />
          <FinanceReconciliation purpose={reason} />
          <section className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Refund reserve</h2>
            <p className="text-sm text-muted-foreground">
              Record only funds already confirmed in the provider account. Available reserve must
              cover the full approved refund; payment gateway fees remain an operating cost.
            </p>
            {reserve.map((row, i) => (
              <p key={i} className="text-sm">
                Confirmed ₹{(Number(row.confirmed_paise) / 100).toFixed(2)} · Reserved ₹
                {(Number(row.reserved_paise) / 100).toFixed(2)} · Spent ₹
                {(Number(row.spent_paise) / 100).toFixed(2)}
              </p>
            ))}
            <form className="space-y-3" onSubmit={fund}>
              <Field
                label="Verified funding reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                minLength={10}
                maxLength={100}
                required
              />
              <Field
                label="Confirmed reserve funding (INR)"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <Button variant="outline" disabled={action.loading || reason.trim().length < 10}>
                Record verified funding
              </Button>
            </form>
          </section>
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold">Refund operations</h2>
            {!queue.length && <p>No refund operations recorded.</p>}
            {queue.map((row) => (
              <article key={row.id} className="rounded-xl border p-4 text-sm">
                <p className="font-semibold">
                  {row.status} · ₹{(row.amount_paise / 100).toFixed(2)}
                </p>
                <p className="mt-2 break-all">Purchase: {row.cycle_id}</p>
                <p className="mt-2 break-all">Refund: {row.id}</p>
                <p className="mt-2">
                  {row.reason} · Attempts: {row.attempts}
                </p>
                {row.last_error && <p className="mt-2 text-coral-strong">{row.last_error}</p>}
                {row.status !== "PROCESSED" && (
                  <Button
                    type="button"
                    className="mt-3"
                    variant="outline"
                    disabled={action.loading}
                    onClick={() =>
                      void action.run(async () => {
                        const r = await api.retryRefund(row.id, reason);
                        if (r.ok) {
                          setNotice("Same refund operation scheduled for reconciliation.");
                          await load();
                        } else setError(describeFailure(r.error));
                      })
                    }
                  >
                    Retry same refund operation
                  </Button>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </AuthShell>
  );
}
