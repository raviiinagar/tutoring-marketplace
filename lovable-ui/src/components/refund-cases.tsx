import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, describeFailure, type RefundCase } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Notice, useSingleFlight } from "@/components/account/ui";
export function RefundCasePanel({ purchaseId }: { purchaseId: string }) {
  const [rows, setRows] = useState<RefundCase[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const action = useSingleFlight();
  const key = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    const r = await api.refundCases(purchaseId);
    if (r.ok) setRows(r.data.cases);
    else setError(describeFailure(r.error));
  }, [purchaseId]);
  useEffect(() => {
    void load();
  }, [load]);
  const submit = () => {
    void action.run(async () => {
      setError(undefined);
      const r = await api.createRefundCase(purchaseId, key.current, reason);
      if (r.ok) {
        setReason("");
        key.current = crypto.randomUUID();
        await load();
      } else setError(describeFailure(r.error));
    });
  };
  return (
    <section className="mt-5 space-y-4" aria-label="Reviewed refund requests">
      <h3 className="font-semibold">Request a refund review</h3>
      <p className="text-sm text-muted-foreground">
        Your Access Pass has started. Finance reviews post-connection adjustments individually;
        submitting a case does not confirm a refund. Keep child details and private documents out of
        your reason.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Refund review reason
          <textarea
            className="input mt-2 min-h-24"
            aria-label="Refund review reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              key.current = crypto.randomUUID();
            }}
            minLength={20}
            maxLength={1000}
            required
          />
        </label>
        <Button
          type="button"
          disabled={action.loading || reason.trim().length < 20}
          onClick={submit}
        >
          Submit refund review
        </Button>
      </div>
      {rows.map((row) => (
        <article key={row.id} className="rounded-xl border p-4 text-sm">
          <p className="font-semibold">Review: {row.status}</p>
          <p className="mt-2 whitespace-pre-wrap break-words">{row.reason}</p>
          {row.review_reason && <p className="mt-2">Decision: {row.review_reason}</p>}
          {row.amount_paise !== null && (
            <p className="mt-2">
              Approved amount: ₹{(row.amount_paise / 100).toFixed(2)} ·{" "}
              {row.access_treatment === "KEEP" ? "Access unchanged" : "Future enquiries stopped"}
            </p>
          )}
        </article>
      ))}
      <Button type="button" variant="outline" disabled={action.loading} onClick={() => void load()}>
        Refresh refund reviews
      </Button>
    </section>
  );
}
export function FinanceReviews({ purpose }: { purpose: string }) {
  const [rows, setRows] = useState<RefundCase[]>();
  const [exceptions, setExceptions] = useState<
    { id: string; kind: string; reference: string; status: string }[]
  >([]);
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");
  const [treatment, setTreatment] = useState<"KEEP" | "REVOKE_FUTURE">("KEEP");
  const [error, setError] = useState<string>();
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.financeCases(purpose);
    if (r.ok) {
      setRows(r.data.cases);
      setExceptions(r.data.exceptions);
    } else setError(describeFailure(r.error));
  };
  const decide = (outcome: "APPROVE" | "DECLINE") =>
    action.run(async () => {
      setError(undefined);
      const paise = Number(amount) * 100;
      if (outcome === "APPROVE" && (!Number.isSafeInteger(paise) || paise <= 0)) {
        setError("Enter an exact positive adjustment amount.");
        return;
      }
      const r = await api.reviewRefundCase(
        selected,
        outcome === "DECLINE"
          ? { outcome, reason: purpose }
          : { outcome, reason: purpose, amount_paise: paise, access_treatment: treatment },
      );
      if (r.ok) {
        setSelected("");
        setAmount("");
        await load();
      } else setError(describeFailure(r.error));
    });
  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">Post-connection refund cases</h2>
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        type="button"
        variant="outline"
        disabled={action.loading || purpose.trim().length < 10}
        onClick={() => void action.run(load)}
      >
        Inspect refund cases and exceptions
      </Button>
      {rows?.map((row) => (
        <article key={row.id} className="rounded-xl border p-4 text-sm">
          <p className="font-semibold">{row.status}</p>
          <p className="mt-2 break-all">Purchase: {row.cycle_id}</p>
          <p className="mt-2 whitespace-pre-wrap break-words">{row.reason}</p>
          {row.review_reason && <p className="mt-2">{row.review_reason}</p>}
          {row.status === "OPEN" && (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => {
                setSelected(row.id);
                setAmount("");
              }}
            >
              Review this case
            </Button>
          )}
        </article>
      ))}
      {selected && (
        <div className="space-y-3 rounded-xl border p-4">
          <Field
            label="Approved refund amount (INR)"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <label className="block text-sm font-medium">
            Access treatment
            <select
              className="input mt-2"
              value={treatment}
              onChange={(e) => setTreatment(e.target.value as "KEEP" | "REVOKE_FUTURE")}
            >
              <option value="KEEP">Keep acquisition access (partial adjustment)</option>
              <option value="REVOKE_FUTURE">
                Revoke future enquiries; preserve safe existing conversations
              </option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            The purpose entered above is recorded as the decision reason. A full refund must revoke
            future acquisition rights.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button disabled={action.loading} onClick={() => void decide("APPROVE")}>
              Approve reviewed refund
            </Button>
            <Button
              variant="outline"
              disabled={action.loading}
              onClick={() => void decide("DECLINE")}
            >
              Decline refund case
            </Button>
          </div>
        </div>
      )}
      {exceptions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Financial exceptions</h3>
          {exceptions.map((row) => (
            <p key={row.id} className="break-all rounded-xl border p-3 text-sm">
              {row.kind} · {row.status} · {row.reference}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
