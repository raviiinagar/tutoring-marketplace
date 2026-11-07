import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { api, describeFailure, type ContactRequest, type IncomingRequest } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { RequestDeadline, requestTimeRemaining } from "@/components/request-deadline";
import { connectionReason } from "@/components/connection-reason";
import { Button } from "@/components/ui/button";

/** Requests are not conversations and cannot disclose contact information. */
export function InboxRequests({
  tutor,
  onAccepted,
}: {
  tutor: boolean;
  onAccepted: (connectionId: string) => void;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<(IncomingRequest | ContactRequest)[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [expanded, setExpanded] = useState<boolean>();
  const [elapsed, setElapsed] = useState(0);
  const receivedAt = useRef(performance.now());
  const generation = useRef(0);
  const active = useRef(true);
  const summary = useRef<HTMLElement>(null);
  const action = useSingleFlight();
  const load = useCallback(async () => {
    const attempt = ++generation.current;
    setLoading(true);
    const result = await (tutor ? api.tutorRequests(cursor) : api.contactRequests(cursor));
    if (attempt !== generation.current) return;
    if (result.ok) {
      receivedAt.current = performance.now();
      setElapsed(0);
      setRows(result.data.requests);
      setNext(result.data.next_cursor || undefined);
      setError(undefined);
    } else {
      setRows([]);
      setNext(undefined);
      setError(describeFailure(result.error));
      if (result.error.kind === "http" && result.error.status === 401)
        void navigate({ to: "/auth/signin", replace: true });
    }
    setLoading(false);
  }, [cursor, tutor, navigate]);
  useEffect(() => {
    active.current = true;
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 15000);
    const clock = setInterval(() => setElapsed(performance.now() - receivedAt.current), 1000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active.current = false;
      generation.current++;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const decide = (row: IncomingRequest, decision: "ACCEPT" | "DECLINE") => {
    if (!tutor || loading || !(decision === "ACCEPT" ? row.can_accept : row.can_decline)) return;
    void action.run(async () => {
      setExpanded(true);
      setNotice(undefined);
      const result = await api.decideRequest(row.id, decision);
      if (!active.current) return;
      await load();
      // A role change or unmount must not navigate into a stale private result.
      if (!active.current) return;
      if (!result.ok) setError(describeFailure(result.error));
      else if (result.data.status === "ACCEPTED" && result.data.connection_id) {
        onAccepted(result.data.connection_id);
        return;
      } else
        setNotice(result.data.status === "DECLINED" ? "Enquiry declined." : "Acceptance recorded.");
      summary.current?.focus();
    });
  };
  const pendingCount = tutor
    ? rows.filter(
        (row) =>
          "can_accept" in row &&
          (row.can_accept || row.can_decline) &&
          row.status === "PENDING" &&
          requestTimeRemaining(row, elapsed) > 0,
      ).length
    : 0;
  return (
    <details
      id="inbox-requests"
      className="inbox-requests mb-4 border-b pb-4"
      open={expanded ?? pendingCount > 0}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary ref={summary} className="cursor-pointer text-sm font-semibold">
        Requests{pendingCount ? ` (${pendingCount} pending)` : ""}
      </summary>
      <section
        aria-label={tutor ? "Incoming requests" : "Sent requests"}
        className="mt-3 space-y-4"
      >
        <p className="text-xs text-muted-foreground">
          {tutor ? "Incoming enquiries" : "Your sent enquiries"}. A pending request does not open a
          chat or share contacts.
        </p>
        <p className="text-xs text-muted-foreground">Pending counts cover only the loaded page.</p>
        {notice && <Notice tone="success">{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {loading && !rows.length ? (
          <p role="status">Loading requests…</p>
        ) : !error && !rows.length ? (
          <p>No {tutor ? "incoming" : "sent"} requests yet.</p>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="space-y-2 rounded-lg border p-3 text-sm [overflow-wrap:anywhere]"
            >
              <h2 className="font-semibold">{row.offer.title}</h2>
              {row.test_only && (
                <p className="text-xs">Fictional test request. No payment was made.</p>
              )}
              {"learner_usable" in row && row.learner_usable && row.learner_alias && (
                <p>Learner: {row.learner_alias}</p>
              )}
              {!("learner_usable" in row) || row.learner_usable ? (
                row.learning_requirements ? (
                  <>
                    <p className="whitespace-pre-wrap">{row.learning_requirements}</p>
                    <p className="whitespace-pre-wrap">Preferred times: {row.preferred_times}</p>
                  </>
                ) : (
                  <p>Private enquiry details are currently unavailable.</p>
                )
              ) : (
                <p>The Learner profile is unavailable. Its private enquiry details are hidden.</p>
              )}
              {"unavailable_reason" in row && row.unavailable_reason && (
                <p>{connectionReason(row.unavailable_reason)}</p>
              )}
              <RequestDeadline request={row}>
                {(pending) =>
                  tutor &&
                  pending &&
                  "can_accept" in row && (
                    <div className="flex flex-wrap gap-2">
                      {row.can_accept && (
                        <Button
                          size="sm"
                          disabled={loading || action.loading}
                          onClick={() => decide(row, "ACCEPT")}
                        >
                          Accept enquiry
                        </Button>
                      )}
                      {row.can_decline && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loading || action.loading}
                          onClick={() => decide(row, "DECLINE")}
                        >
                          Decline enquiry
                        </Button>
                      )}
                    </div>
                  )
                }
              </RequestDeadline>
              {row.status === "ACCEPTED" && row.connection_id && (
                <Link
                  to="/connections"
                  search={{ conversation: row.connection_id }}
                  resetScroll={false}
                  className="link block"
                >
                  Open conversation
                </Link>
              )}
              <Link
                to="/safety/$kind/$targetId"
                params={{ kind: "request", targetId: row.id }}
                className="link block"
              >
                Report or block request
              </Link>
            </article>
          ))
        )}
        <nav aria-label="Request pages" className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || action.loading}
            onClick={() => void load()}
          >
            Refresh requests
          </Button>
          {cursor && (
            <Button
              size="sm"
              variant="outline"
              disabled={loading || action.loading}
              onClick={() => {
                setExpanded(undefined);
                setCursor(undefined);
              }}
            >
              First requests
            </Button>
          )}
          {next && (
            <Button
              size="sm"
              disabled={loading || action.loading}
              onClick={() => {
                setExpanded(undefined);
                setCursor(next);
              }}
            >
              Next requests
            </Button>
          )}
        </nav>
      </section>
    </details>
  );
}
