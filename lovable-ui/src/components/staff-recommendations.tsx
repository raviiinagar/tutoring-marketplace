import { useState, type FormEvent } from "react";
import { describeFailure } from "@/lib/api";
import { reputationApi, type StaffRecommendation } from "@/lib/tutor-reputation-api";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import { AuthShell, Field, Notice, useSingleFlight } from "./account/ui";
import { Button } from "./ui/button";
import { recommendationStatuses } from "./tutor-recommendations";

export function StaffRecommendationsPage() {
  const account = useTutorAccount();
  return (
    <AuthShell
      wide
      title="Recommendation moderation"
      intro="Review network endorsements separately from connected-student reviews. Trust access and an active staff session are required."
    >
      {account.user ? (
        <StaffRecommendations key={account.user.id} />
      ) : account.error ? (
        <Notice tone="error">{account.error}</Notice>
      ) : (
        <p>Please sign in and unlock staff access from the staff console.</p>
      )}
    </AuthShell>
  );
}
function StaffRecommendations() {
  const [reason, setReason] = useState(""),
    [decisionReason, setDecisionReason] = useState(""),
    [rows, setRows] = useState<StaffRecommendation[]>(),
    [selected, setSelected] = useState<StaffRecommendation>(),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [outcome, setOutcome] = useState<"PUBLISH" | "REJECT" | "REMOVE">("PUBLISH");
  const action = useSingleFlight();
  const load = async () => {
    setError(undefined);
    setSelected(undefined);
    const result = await reputationApi.queue(reason.trim());
    if (result.ok) setRows(result.data.recommendations);
    else {
      setRows(undefined);
      setError(describeFailure(result.error));
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void action.run(load);
  };
  const decide = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void action.run(async () => {
      setError(undefined);
      setNotice(undefined);
      const result = await reputationApi.decide(selected.id, {
        revision: selected.revision,
        outcome,
        reason: decisionReason.trim(),
      });
      if (result.ok) {
        setNotice(
          "Recommendation decision saved. Badge eligibility is recalculated from published content.",
        );
        await load();
      } else {
        setError(describeFailure(result.error));
        setSelected(undefined);
        setRows(undefined);
      }
    });
  };
  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <form className="space-y-4 rounded-2xl border p-5" onSubmit={submit}>
        <Field
          label="Reason for recommendation access"
          required
          minLength={10}
          maxLength={240}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="This reason is audited. Review relevance, privacy, misleading claims and abuse."
        />
        <Button disabled={action.loading}>
          {action.loading ? "Loading…" : "Load recommendation queue"}
        </Button>
      </form>
      {rows && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent recommendations</h2>
          <p className="text-xs text-muted-foreground">
            Up to 100 recent submissions, with pending items first.
          </p>
          {rows.length ? (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
                  key={row.id}
                >
                  <div>
                    <p className="font-semibold">
                      {row.tutor_display_name} · {recommendationStatuses[row.status]}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      From {row.author_display_name} · revision {row.revision}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={action.loading || row.status === "WITHDRAWN"}
                    onClick={() => {
                      setSelected(row);
                      setDecisionReason("");
                      setOutcome(row.status === "PUBLISHED" ? "REMOVE" : "PUBLISH");
                    }}
                  >
                    Review recommendation
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No recommendations available.</p>
          )}
        </section>
      )}
      {selected && (
        <form
          aria-label="Recommendation decision"
          className="space-y-5 rounded-2xl border bg-card p-5"
          onSubmit={decide}
        >
          <h2 className="text-lg font-semibold">Review for {selected.tutor_display_name}</h2>
          <p className="text-sm text-muted-foreground">
            Relationship: {selected.relationship.replaceAll("_", " ").toLowerCase()}. This
            endorsement does not certify a lesson or qualification.
          </p>
          <blockquote className="whitespace-pre-wrap break-words rounded-xl bg-secondary p-4 text-sm">
            {selected.text}
          </blockquote>
          <label className="block text-sm font-semibold">
            Decision
            <select
              className="input mt-2"
              value={outcome}
              onChange={(event) =>
                setOutcome(event.target.value as "PUBLISH" | "REJECT" | "REMOVE")
              }
            >
              <option value="PUBLISH">Publish recommendation</option>
              <option value="REJECT">Reject recommendation</option>
              <option value="REMOVE">Remove published recommendation</option>
            </select>
          </label>
          <Field
            label="Reason for decision"
            required
            minLength={10}
            maxLength={240}
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
          />
          <Button disabled={action.loading}>
            {action.loading ? "Saving…" : "Save recommendation decision"}
          </Button>
        </form>
      )}
    </div>
  );
}
