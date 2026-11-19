import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Clock, Hourglass } from "lucide-react";
import { api, describeFailure, type ContactRequest, type IncomingRequest } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { requestTimeRemaining } from "@/components/request-deadline";
import { connectionReason } from "@/components/connection-reason";
import { timeLeft } from "@/lib/workspace";

type Row = IncomingRequest | ContactRequest;
const DAY = 24 * 3600000;
const initials = (text: string) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

function RequestStatus({ row, remaining, tutor }: { row: Row; remaining: number; tutor: boolean }) {
  const status = row.status === "PENDING" && remaining <= 0 ? "EXPIRED" : row.status;
  const deadline = (
    <>
      <span className="sr-only">{`Status: ${status}`}</span>
      <span className="sr-only">
        {" "}
        Response deadline:{" "}
        <time dateTime={row.expires_at}>{new Date(row.expires_at).toLocaleString()}</time>
      </span>
    </>
  );
  if (status === "PENDING")
    return (
      <p className={`inbox-chip${remaining <= DAY ? " inbox-chip-soon" : " inbox-chip-wait"}`}>
        <Hourglass aria-hidden="true" className="size-4" />
        {tutor ? `Reply within ${timeLeft(remaining)}` : `Waiting · ${timeLeft(remaining)} left`}
        {deadline}
      </p>
    );
  return (
    <>
      <p className={`inbox-chip${status === "ACCEPTED" ? " inbox-chip-ok" : ""}`}>
        {status === "ACCEPTED" ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Clock aria-hidden="true" className="size-4" />
        )}
        {status === "ACCEPTED"
          ? "Accepted"
          : status === "DECLINED"
            ? "Declined"
            : status === "CANCELLED"
              ? "Cancelled"
              : "Expired"}
        {deadline}
      </p>
      {status === "EXPIRED" && (
        <p className="inbox-req-note">
          The response window has ended. A new enquiry needs current access.
        </p>
      )}
    </>
  );
}

/**
 * Enquiries are not conversations and cannot disclose contact information. The inbox shows
 * them in their own "Enquiries" tab; the parent learns how many still need attention.
 */
export function InboxRequests({
  tutor,
  onAccepted,
  onPendingChange,
}: {
  tutor: boolean;
  onAccepted: (connectionId: string) => void;
  onPendingChange?: (pending: number) => void;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const receivedAt = useRef(performance.now());
  const generation = useRef(0);
  const active = useRef(true);
  const panel = useRef<HTMLElement>(null);
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
      panel.current?.focus();
    });
  };
  const pendingCount = rows.filter(
    (row) =>
      row.status === "PENDING" &&
      requestTimeRemaining(row, elapsed) > 0 &&
      (!tutor || ("can_accept" in row && (row.can_accept || row.can_decline))),
  ).length;
  useEffect(() => onPendingChange?.(pendingCount), [pendingCount, onPendingChange]);
  return (
    <section
      ref={panel}
      id="inbox-requests"
      tabIndex={-1}
      aria-label={tutor ? "Incoming requests" : "Sent requests"}
      className="inbox-req-panel"
    >
      <p className="inbox-req-intro">
        {tutor
          ? "Accept to start chatting. Each enquiry stays open for 72 hours."
          : "Your sent enquiries. Tutors have 72 hours to reply."}{" "}
        A pending request does not open a chat or share contacts.
      </p>
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {loading && !rows.length ? (
        <p role="status" className="inbox-req-note">
          Loading requests…
        </p>
      ) : !error && !rows.length ? (
        <p className="inbox-req-empty">No {tutor ? "incoming" : "sent"} requests yet.</p>
      ) : (
        <ul className="inbox-req-list">
          {rows.map((row) => {
            const remaining = requestTimeRemaining(row, elapsed);
            const pending = row.status === "PENDING" && remaining > 0;
            const visible = !("learner_usable" in row) || row.learner_usable;
            return (
              <li key={row.id}>
                <article className="inbox-req">
                  <div className="inbox-req-head">
                    <span className="inbox-req-avatar" aria-hidden="true">
                      {initials(
                        ("learner_alias" in row && row.learner_usable && row.learner_alias) ||
                          row.offer.title,
                      )}
                    </span>
                    <div className="min-w-0">
                      <h2>{row.offer.title}</h2>
                      {"learner_usable" in row && row.learner_usable && row.learner_alias && (
                        <p>Learner: {row.learner_alias}</p>
                      )}
                    </div>
                  </div>
                  {row.test_only && (
                    <p className="inbox-req-note">Fictional test request. No payment was made.</p>
                  )}
                  {visible ? (
                    row.learning_requirements ? (
                      <>
                        <p className="inbox-req-quote">{row.learning_requirements}</p>
                        <p className="inbox-req-times">
                          <span>Preferred times</span> {row.preferred_times}
                        </p>
                      </>
                    ) : (
                      <p className="inbox-req-note">
                        Private enquiry details are currently unavailable.
                      </p>
                    )
                  ) : (
                    <p className="inbox-req-note">
                      The Learner profile is unavailable. Its private enquiry details are hidden.
                    </p>
                  )}
                  {"unavailable_reason" in row && row.unavailable_reason && (
                    <p className="inbox-req-note">{connectionReason(row.unavailable_reason)}</p>
                  )}
                  <RequestStatus row={row} remaining={remaining} tutor={tutor} />
                  {tutor &&
                    pending &&
                    "can_accept" in row &&
                    (row.can_accept || row.can_decline) && (
                      <div className="inbox-req-actions">
                        {row.can_accept && (
                          <button
                            type="button"
                            className="ws-btn ws-btn-primary ws-btn-sm"
                            disabled={loading || action.loading}
                            onClick={() => decide(row, "ACCEPT")}
                          >
                            <Check aria-hidden="true" className="size-4" />
                            Accept enquiry
                          </button>
                        )}
                        {row.can_decline && (
                          <button
                            type="button"
                            className="ws-btn ws-btn-soft ws-btn-sm"
                            disabled={loading || action.loading}
                            onClick={() => decide(row, "DECLINE")}
                          >
                            Decline enquiry
                          </button>
                        )}
                      </div>
                    )}
                  <div className="inbox-req-links">
                    {row.status === "ACCEPTED" && row.connection_id && (
                      <Link
                        to="/connections"
                        search={{ conversation: row.connection_id }}
                        resetScroll={false}
                        className="ws-link"
                      >
                        Open conversation
                      </Link>
                    )}
                    <Link
                      to="/safety/$kind/$targetId"
                      params={{ kind: "request", targetId: row.id }}
                      className="inbox-req-report"
                    >
                      Report or block request
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      <p className="inbox-req-note">Pending counts cover only the loaded page.</p>
      <nav aria-label="Request pages" className="inbox-req-pages">
        <button
          type="button"
          className="ws-btn ws-btn-soft ws-btn-sm"
          disabled={loading || action.loading}
          onClick={() => void load()}
        >
          Refresh requests
        </button>
        {cursor && (
          <button
            type="button"
            className="ws-btn ws-btn-soft ws-btn-sm"
            disabled={loading || action.loading}
            onClick={() => setCursor(undefined)}
          >
            First requests
          </button>
        )}
        {next && (
          <button
            type="button"
            className="ws-btn ws-btn-soft ws-btn-sm"
            disabled={loading || action.loading}
            onClick={() => setCursor(next)}
          >
            Next requests
          </button>
        )}
      </nav>
    </section>
  );
}
