import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  describeFailure,
  type ReviewContext,
  type ReviewRow,
  type PublicReviewPage,
} from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
const control = "mt-2 w-full rounded-xl border bg-background p-3 text-sm";
export function ReviewForm({ connectionId }: { connectionId: string }) {
  const [context, setContext] = useState<ReviewContext>();
  const [error, setError] = useState<string>();
  const [rating, setRating] = useState("");
  const [text, setText] = useState("");
  const [attested, setAttested] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const key = useRef<string | undefined>(undefined);
  const action = useSingleFlight();
  const load = useCallback(async () => {
    const r = await api.reviewContext(connectionId);
    if (r.ok) {
      setContext(r.data);
      setError(undefined);
    } else setError(describeFailure(r.error));
  }, [connectionId]);
  useEffect(() => {
    void load();
  }, [load]);
  const send = () =>
    action.run(async () => {
      if (!context?.eligible || !attested || !rating) return;
      key.current ||= crypto.randomUUID();
      const r = await api.submitReview(connectionId, {
        request_key: key.current,
        rating: Number(rating),
        text,
        interaction_attested: true,
        policy_version: context.policy_version,
      });
      if (r.ok) {
        setSubmitted(true);
        await load();
      } else setError(describeFailure(r.error));
    });
  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      {submitted && <Notice tone="info">Your review was submitted for moderation.</Notice>}
      {!context && !error && <p role="status">Checking review eligibility...</p>}
      {context && (
        <>
          <p className="text-sm text-muted-foreground">{context.policy}</p>
          {context.review ? (
            <p className="rounded-xl bg-secondary p-4 text-sm">
              Your review: {context.review.status}. Manage feedback and moderation appeals from My
              reviews.
            </p>
          ) : !context.eligible ? (
            <Notice tone="info">
              Reviews open {new Date(context.eligible_at).toLocaleString()}, seven days after this
              Connection was established.
            </Notice>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label className="block text-sm font-medium">
                Your rating
                <select
                  aria-label="Your rating"
                  className={control}
                  value={rating}
                  onChange={(e) => {
                    setRating(e.target.value);
                    key.current = undefined;
                  }}
                  required
                >
                  <option value="">Choose a rating</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option value={n} key={n}>
                      {n} {n === 1 ? "star" : "stars"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Your feedback
                <textarea
                  aria-label="Your feedback"
                  className={control + " min-h-32"}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    key.current = undefined;
                  }}
                  minLength={30}
                  maxLength={1500}
                  required
                />
              </label>
              <p className="text-xs text-muted-foreground">
                30–1500 characters. Describe your interaction without child names, contacts, links
                or private documents.
              </p>
              <label className="flex items-start gap-3 text-sm">
                <input
                  aria-label="I had an actual interaction with this Tutor."
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                  className="mt-1"
                />
                <span>I had an actual interaction with this Tutor.</span>
              </label>
              <p className="text-xs text-muted-foreground">
                A Connection is confirmed; lesson attendance is not independently verified. Positive
                and negative feedback follow the same policy.
              </p>
              <Button
                disabled={action.loading || !attested || !rating || text.trim().length < 30}
                type="submit"
              >
                {action.loading ? "Submitting..." : "Submit review for moderation"}
              </Button>
            </form>
          )}
        </>
      )}
      <Button variant="outline" onClick={() => void action.run(load)} disabled={action.loading}>
        Refresh review eligibility
      </Button>
    </div>
  );
}
export function PublicReviews({ listingId }: { listingId: string }) {
  const [page, setPage] = useState<PublicReviewPage>();
  const [cursor, setCursor] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const r = await api.publicReviews(listingId, cursor);
    if (r.ok) {
      setPage(r.data);
      setError(undefined);
    } else {
      setPage(undefined);
      setError(describeFailure(r.error));
    }
  }, [listingId, cursor]);
  useEffect(() => {
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load]);
  return (
    <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Connection-linked reviews">
      <h2 className="text-xl font-semibold">Connection-linked reviews</h2>
      {error && <Notice tone="error">{error}</Notice>}
      {page ? (
        <>
          <p className="mt-3 text-sm text-muted-foreground">{page.disclaimer}</p>
          {page.summary.count ? (
            <p className="mt-5 font-semibold">
              {page.summary.average?.toFixed(1)} / 5 · {page.summary.count} published{" "}
              {page.summary.count === 1 ? "review" : "reviews"}
            </p>
          ) : (
            <p className="mt-5 text-muted-foreground">No published reviews yet.</p>
          )}
          <ul className="mt-5 space-y-4">
            {page.reviews.map((row) => (
              <li key={row.id} className="rounded-xl border p-5">
                <p className="text-sm font-semibold">
                  {row.rating} / 5 · {row.reviewer}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.label} · {new Date(row.created_at).toLocaleDateString()}
                </p>
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {row.text}
                </p>
              </li>
            ))}
          </ul>
          <nav className="mt-4 flex flex-wrap gap-3" aria-label="Review pages">
            <Button variant="outline" onClick={() => void load()}>
              Refresh reviews
            </Button>
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(undefined)}>
                First reviews
              </Button>
            )}
            {page.next_cursor && (
              <Button onClick={() => setCursor(page.next_cursor!)}>Next reviews</Button>
            )}
          </nav>
        </>
      ) : (
        !error && (
          <p role="status" className="mt-4">
            Loading reviews...
          </p>
        )
      )}
    </section>
  );
}
export function MyReviews() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, { key: string; text: string }>>({});
  const action = useSingleFlight();
  const load = useCallback(async () => {
    const r = await api.ownReviews();
    if (r.ok) {
      setRows(r.data.reviews);
      setError(undefined);
    } else setError(describeFailure(r.error));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const withdraw = (row: ReviewRow) =>
    action.run(async () => {
      const r = await api.withdrawReview(row.id, row.revision);
      if (r.ok) await load();
      else setError(describeFailure(r.error));
    });
  const appeal = (row: ReviewRow) =>
    action.run(async () => {
      const draft = drafts[row.id];
      if (!draft) return;
      const r = await api.appealReview(row.id, {
        request_key: draft.key,
        description: draft.text,
        revision: row.revision,
      });
      if (r.ok) {
        setDrafts({ ...drafts, [row.id]: { key: crypto.randomUUID(), text: "" } });
        await load();
      } else setError(describeFailure(r.error));
    });
  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-sm text-muted-foreground">
        Your submitted and received feedback. Appeals are recorded privately for the upcoming
        support-case workflow.
      </p>
      {!rows.length && !error && <p>No reviews yet. Open a Connection to check eligibility.</p>}
      {rows.map((row) => (
        <article key={row.id} className="space-y-4 rounded-xl border p-5">
          <p className="font-semibold">
            {row.rating} / 5 · {row.status}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.relationship === "AUTHOR" ? "Your feedback" : "Feedback about your tutoring"} ·{" "}
            {row.test_only ? "Fictional test review" : "Connection-linked review"}
          </p>
          {row.text && <p className="whitespace-pre-wrap break-words text-sm">{row.text}</p>}
          {row.decisions?.map((d) => (
            <p key={d.id} className="text-sm">
              {d.outcome}: {d.reason}
            </p>
          ))}
          {row.relationship === "AUTHOR" && row.status !== "WITHDRAWN" && (
            <Button variant="outline" disabled={action.loading} onClick={() => void withdraw(row)}>
              Withdraw my review
            </Button>
          )}
          {row.appeals?.map((a) => (
            <p key={a.id} className="break-all text-sm">
              Appeal {a.id}: {a.status}
            </p>
          ))}
          {["PUBLISHED", "REJECTED", "REMOVED"].includes(row.status) &&
            !row.appeals?.some((a) => a.review_revision === row.revision) && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void appeal(row);
                }}
              >
                <label className="block text-sm">
                  Appeal details
                  <textarea
                    aria-label={"Appeal details for " + row.id}
                    className={control}
                    minLength={10}
                    maxLength={2000}
                    required
                    value={drafts[row.id]?.text || ""}
                    onChange={(e) =>
                      setDrafts({
                        ...drafts,
                        [row.id]: { key: crypto.randomUUID(), text: e.target.value },
                      })
                    }
                  />
                </label>
                <Button disabled={action.loading}>Submit moderation appeal</Button>
              </form>
            )}
        </article>
      ))}
      <Button variant="outline" disabled={action.loading} onClick={() => void action.run(load)}>
        Refresh my reviews
      </Button>
    </div>
  );
}
