import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeFailure, type PaymentHistoryRow, type PaymentDocument } from "@/lib/api";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { RefundPanel } from "@/components/refund-panel";
export const Route = createFileRoute("/payments_/history")({
  ssr: false,
  component: History,
  head: () => ({
    meta: [
      { title: "Payment history — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function History() {
  const [rows, setRows] = useState<PaymentHistoryRow[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [document, setDocument] = useState<PaymentDocument>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const r = await api.paymentHistory(cursor);
    if (r.ok) {
      setRows(r.data.purchases);
      setNext(r.data.next_cursor || undefined);
    } else setError(describeFailure(r.error));
    setLoading(false);
  }, [cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  const receipt = async (id: string) => {
    setError(undefined);
    const r = await api.paymentReceipt(id);
    if (r.ok) setDocument(r.data.document);
    else setError(describeFailure(r.error));
  };
  return (
    <AuthShell
      title="Payment history"
      intro="Your platform Access Pass purchases and reversals. Direct tuition is paid to Tutors and is excluded."
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {loading && <p role="status">Loading payments…</p>}
      {!loading && !rows.length && <p>No platform purchases yet.</p>}
      <div className="space-y-6">
        {rows.map((row) => (
          <article key={row.id} className="rounded-2xl border p-5">
            <p className="font-semibold">Access Pass · ₹{(row.amount_paise / 100).toFixed(2)}</p>
            <p className="mt-2 text-sm">
              {row.status} · {new Date(row.created_at).toLocaleString()}
            </p>
            {row.test_only && (
              <p className="mt-2 text-xs text-muted-foreground">
                Fictional test transaction. No real payment or tax invoice.
              </p>
            )}
            {row.resolution_required && (
              <p className="mt-2 text-sm text-coral-strong">
                Financial resolution is required. Review the recorded refund progress.
              </p>
            )}
            {row.captures.map((fact, i) => (
              <p key={i} className="mt-2 text-sm">
                {fact.kind === "CAPTURE"
                  ? "Verified platform capture"
                  : "Unexpected captured amount"}
                : ₹{(Number(fact.amount_paise) / 100).toFixed(2)}
              </p>
            ))}
            {row.reversals.map((fact, i) => (
              <p key={i} className="mt-2 text-sm">
                {fact.kind}: ₹{(Number(fact.amount_paise) / 100).toFixed(2)}
              </p>
            ))}
            {row.receipt_available && (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => void receipt(row.id)}
              >
                View payment confirmation
              </Button>
            )}
            <RefundPanel purchaseId={row.id} />
          </article>
        ))}
      </div>
      {document && (
        <section
          aria-label="Payment confirmation"
          className="mt-6 space-y-3 rounded-2xl border bg-secondary p-5"
        >
          <h2 className="text-xl font-semibold">
            {document.test_only ? "Test payment confirmation" : "Payment confirmation"}
          </h2>
          <p className="font-semibold">{document.merchant}</p>
          <p className="break-all text-xs">{document.number}</p>
          <p className="text-sm">{document.description}</p>
          <p className="text-lg font-semibold">₹{(document.amount_paise / 100).toFixed(2)}</p>
          <p className="text-sm">
            Base ₹{(document.base_paise / 100).toFixed(2)} · Tax snapshot ₹
            {(document.tax_paise / 100).toFixed(2)}
          </p>
          <p className="text-sm">Paid: {new Date(document.paid_at).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">
            {document.invoice_notice} {document.tax_document_notice}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }),
              );
              const a = window.document.createElement("a");
              a.href = url;
              a.download = `payment-confirmation-${document.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download payment record
          </Button>
        </section>
      )}
      <nav className="mt-6 flex flex-wrap gap-3" aria-label="Payment history pages">
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh payments
        </Button>
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(undefined)}>
            First purchases
          </Button>
        )}
        {next && <Button onClick={() => setCursor(next)}>Next purchases</Button>}
      </nav>
    </AuthShell>
  );
}
