import { useState, type FormEvent } from "react";
import { api, describeFailure, type ReconciliationView } from "@/lib/api";
import { Field, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export function FinanceReconciliation({ purpose }: { purpose: string }) {
  const [view, setView] = useState<ReconciliationView>();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [reference, setReference] = useState("");
  const [utr, setUtr] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.reconciliation(purpose);
    if (r.ok) setView(r.data);
    else setError(describeFailure(r.error));
  };
  const start = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      setError(undefined);
      const r = await api.startReconciliation({
        request_key: crypto.randomUUID(),
        year: Number(year),
        month: Number(month),
        reason: purpose,
      });
      if (r.ok) {
        setNotice("Read-only provider reconciliation queued. No new charge is created.");
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  const bank = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      setError(undefined);
      const paise = Number(amount) * 100;
      if (!Number.isSafeInteger(paise) || paise <= 0) {
        setError("Enter a positive bank amount with at most two decimal places.");
        return;
      }
      const r = await api.importBankReceipts({
        reason: purpose,
        rows: [
          {
            reference,
            utr,
            amount_paise: paise,
            currency: "INR",
            received_at: new Date(date + "T00:00:00.000Z").toISOString(),
          },
        ],
      });
      if (r.ok) {
        setNotice(
          `${r.data.recorded} bank records imported; ${r.data.conflicts} conflicts require review.`,
        );
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">Settlement and bank reconciliation</h2>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}
      <Button
        type="button"
        variant="outline"
        disabled={action.loading || purpose.trim().length < 10}
        onClick={() => void action.run(load)}
      >
        Inspect financial totals
      </Button>
      {view && (
        <>
          <CaptureEvidence purpose={purpose} onComplete={load} />
          <div className="rounded-xl bg-secondary p-4 text-sm">
            <p>
              Journal debits ₹{(view.totals.total_debits_paise / 100).toFixed(2)} · Credits ₹
              {(view.totals.total_credits_paise / 100).toFixed(2)}
            </p>
            <p className="mt-2">
              Gateway fees including tax ₹{(view.totals.gateway_fee_paise / 100).toFixed(2)} · Tax
              component ₹{(view.totals.gateway_tax_paise / 100).toFixed(2)}
            </p>
            <p className="mt-2">
              Matched bank receipts ₹{(view.totals.bank_received_paise / 100).toFixed(2)}
            </p>
          </div>
          <form onSubmit={start} className="space-y-3 rounded-xl border p-4">
            <Field
              label="Provider statement year"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <Field
              label="Provider statement month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Button disabled={action.loading}>Fetch provider reconciliation</Button>
          </form>
          <form onSubmit={bank} className="space-y-3 rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">
              Record a verified bank statement credit. A processed settlement alone does not prove
              bank receipt.
            </p>
            <Field
              label="Bank statement reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              minLength={10}
              maxLength={100}
              required
            />
            <Field
              label="Settlement UTR"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              required
            />
            <Field
              label="Bank credit amount (INR)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <Field
              label="Bank credit date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Button disabled={action.loading}>Import verified bank receipt</Button>
          </form>
          {view.runs.map((row) => (
            <article key={row.id} className="rounded-xl border p-4 text-sm">
              <p>Statement import: {row.status}</p>
              {row.last_error && <p className="mt-2 text-coral-strong">{row.last_error}</p>}
              {row.status === "REVIEW" && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  disabled={action.loading}
                  onClick={() =>
                    void action.run(async () => {
                      const r = await api.retryReconciliation(row.id, purpose);
                      if (r.ok) await load();
                      else setError(describeFailure(r.error));
                    })
                  }
                >
                  Retry same reconciliation
                </Button>
              )}
            </article>
          ))}
          {view.settlements.map((row) => (
            <p key={row.id} className="break-all rounded-xl border p-4 text-sm">
              {row.id} · ₹{(Number(row.amount_paise) / 100).toFixed(2)} · Provider {row.status} ·{" "}
              {row.bank_matched ? "Bank matched" : "Bank evidence pending"}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
function CaptureEvidence({
  purpose,
  onComplete,
}: {
  purpose: string;
  onComplete: () => Promise<void>;
}) {
  const [purchase, setPurchase] = useState("");
  const [payment, setPayment] = useState("");
  const [instant, setInstant] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const action = useSingleFlight();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      setError(undefined);
      setNotice(undefined);
      const r = await api.confirmCaptureEvidence(purchase, {
        provider_payment_id: payment,
        captured_at: instant,
        reason: purpose,
      });
      if (r.ok) {
        setNotice(
          "Verified capture evidence recorded. The original purchase and deadline are preserved.",
        );
        await onComplete();
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <form className="space-y-3 rounded-xl border p-4" onSubmit={submit}>
      <h3 className="font-semibold">Resolve missing capture-time evidence</h3>
      <p className="text-sm text-muted-foreground">
        Use a capture instant confirmed from provider transaction evidence. Payment creation time
        alone is insufficient. Recording evidence performs provider reads and creates no charge.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <Field
        label="Purchase reference"
        value={purchase}
        onChange={(e) => setPurchase(e.target.value)}
        required
      />
      <Field
        label="Provider payment reference"
        value={payment}
        onChange={(e) => setPayment(e.target.value)}
        required
      />
      <Field
        label="Verified capture instant (UTC ISO)"
        placeholder="2026-10-16T08:30:00.000Z"
        value={instant}
        onChange={(e) => setInstant(e.target.value)}
        required
      />
      <Button variant="outline" disabled={action.loading || purpose.trim().length < 10}>
        Record verified capture evidence
      </Button>
    </form>
  );
}
