import { useState } from "react";
import { api, describeFailure, type ReviewRow } from "@/lib/api";
import { Field, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export function ReviewModeration() {
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selected, setSelected] = useState<ReviewRow>();
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<"PUBLISH" | "REJECT" | "REMOVE">("PUBLISH");
  const [code, setCode] = useState("POLICY_COMPLIANT");
  const [decisionReason, setDecisionReason] = useState("");
  const action = useSingleFlight();
  const load = async () => {
    const r = await api.reviewQueue(reason.trim());
    if (r.ok) {
      setRows(r.data.reviews);
      setError(undefined);
    } else {
      setRows([]);
      setSelected(undefined);
      setError(describeFailure(r.error));
    }
  };
  const inspect = (id: string) =>
    action.run(async () => {
      const r = await api.inspectReview(id, reason.trim());
      if (r.ok) {
        setSelected({ ...r.data.review, decisions: r.data.decisions });
        setOutcome(r.data.review.status === "PUBLISHED" ? "REMOVE" : "PUBLISH");
        setCode(r.data.review.status === "PUBLISHED" ? "PERSONAL_DATA" : "POLICY_COMPLIANT");
        setDecisionReason("");
        setError(undefined);
      } else {
        setSelected(undefined);
        setError(describeFailure(r.error));
      }
    });
  const decide = () =>
    action.run(async () => {
      if (!selected) return;
      const r = await api.moderateReview(selected.id, {
        revision: selected.revision,
        outcome,
        policy_code: code,
        reason: decisionReason.trim(),
      });
      if (r.ok) {
        setSelected(undefined);
        await load();
      } else {
        setSelected(undefined);
        setError(describeFailure(r.error));
      }
    });
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Trust permission and current MFA are required. Apply the same privacy, relevance, abuse and
        unsupported-claim checks to every rating. Negative feedback alone is never a rejection
        reason.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(load);
        }}
      >
        <Field
          label="Purpose for review access"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setRows([]);
            setSelected(undefined);
          }}
          required
          minLength={10}
          maxLength={240}
        />
        <Button disabled={action.loading || reason.trim().length < 10}>Load review queue</Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border p-4">
            <p className="text-sm font-semibold">
              {row.rating} / 5 · {row.status}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">{row.id}</p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={action.loading}
              onClick={() => void inspect(row.id)}
            >
              Inspect review {row.id.slice(0, 8)}
            </Button>
          </li>
        ))}
      </ul>
      {selected && (
        <section className="space-y-4 rounded-xl border p-5" aria-label="Selected review">
          <h2 className="text-xl font-semibold">Review content</h2>
          <p className="text-sm">
            {selected.rating} / 5 · {selected.status} · Revision {selected.revision}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{selected.text}</p>
          {selected.decisions?.map((d) => (
            <p key={d.id} className="text-sm">
              {d.outcome}: {d.reason}
            </p>
          ))}
          {["PENDING", "PUBLISHED"].includes(selected.status) ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void decide();
              }}
            >
              <label className="block text-sm">
                Moderation outcome
                <select
                  aria-label="Moderation outcome"
                  className="mt-2 w-full rounded-xl border p-3"
                  value={outcome}
                  onChange={(e) => {
                    const value = e.target.value as typeof outcome;
                    setOutcome(value);
                    setCode(value === "PUBLISH" ? "POLICY_COMPLIANT" : "PERSONAL_DATA");
                  }}
                >
                  {selected.status === "PENDING" ? (
                    <>
                      <option value="PUBLISH">Publish compliant feedback</option>
                      <option value="REJECT">Reject policy violation</option>
                    </>
                  ) : (
                    <option value="REMOVE">Remove published policy violation</option>
                  )}
                </select>
              </label>
              <label className="block text-sm">
                Policy finding
                <select
                  aria-label="Policy finding"
                  className="mt-2 w-full rounded-xl border p-3"
                  value={code}
                  disabled={outcome === "PUBLISH"}
                  onChange={(e) => setCode(e.target.value)}
                >
                  {outcome === "PUBLISH" ? (
                    <option value="POLICY_COMPLIANT">Policy compliant</option>
                  ) : (
                    <>
                      <option value="PERSONAL_DATA">Personal data or contacts</option>
                      <option value="ABUSE">Abuse</option>
                      <option value="IRRELEVANT">Not relevant to the interaction</option>
                      <option value="UNSUPPORTED_CLAIMS">Unsupported claims</option>
                    </>
                  )}
                </select>
              </label>
              <Field
                label="Moderation decision reason"
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                minLength={10}
                maxLength={240}
                required
                hint="Explain the policy finding without copying private information."
              />
              <Button disabled={action.loading}>Record review decision</Button>
            </form>
          ) : (
            <p className="text-sm">
              This outcome cannot be republished through a stale moderation request.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
