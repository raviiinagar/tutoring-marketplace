import { RequestDeadline } from "@/components/request-deadline";
import { RequestAlternatives } from "@/components/request-alternatives";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeFailure, type ContactRequest } from "@/lib/api";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/requests")({
  ssr: false,
  component: Requests,
  head: () => ({
    meta: [
      { title: "Your Contact Requests — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Requests() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContactRequest[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const r = await api.contactRequests(cursor);
    if (r.ok) {
      setRows(r.data.requests);
      setNext(r.data.next_cursor || undefined);
    } else if (r.error.kind === "http" && r.error.status === 401)
      void navigate({ to: "/auth/signin", replace: true });
    else setError(describeFailure(r.error));
    setLoading(false);
  }, [cursor, navigate]);
  useEffect(() => {
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load]);
  return (
    <AuthShell title="Your Contact Requests">
      <p className="text-sm text-muted-foreground">
        Enquiries and their response deadlines. A pending request is not an accepted lesson or
        permission to share contacts.
      </p>
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {loading ? (
        <p role="status" className="mt-5">
          Loading your enquiries…
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {!rows.length && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-5">
              <h2 className="font-semibold">No enquiries yet</h2>
              <p className="text-sm text-muted-foreground">
                Find a teaching offer, choose a Learner profile and send an enquiry. Your Tutor
                responses will appear here.
              </p>
              <Button asChild>
                <Link to="/tutors">Find a Tutor</Link>
              </Button>
            </div>
          )}
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border p-5">
              <h2 className="font-semibold">{row.offer.title}</h2>
              <RequestDeadline request={row} />
              {row.test_only && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Fictional test request. No payment was made.
                </p>
              )}
              {row.learner_usable ? (
                <>
                  <p className="mt-3 text-sm">Learner: {row.learner_alias}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm">{row.learning_requirements}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    Preferred times: {row.preferred_times}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm">
                  The Learner profile is unavailable. Its private enquiry details are hidden.
                </p>
              )}
              {row.connection_id && (
                <Link
                  to="/connections/$connectionId"
                  params={{ connectionId: row.connection_id }}
                  className="link mt-4 mr-4 inline-block"
                >
                  View Connection
                </Link>
              )}
              <Link
                to="/tutors/$listingId"
                params={{ listingId: row.listing_id }}
                className="link mt-4 inline-block"
              >
                View teaching offer
              </Link>
              <Link
                to="/safety/$kind/$targetId"
                params={{ kind: "request", targetId: row.id }}
                className="link mt-4 block text-sm"
              >
                Report or block
              </Link>
              <RequestAlternatives request={row} />
            </article>
          ))}
        </div>
      )}
      <nav className="mt-6 flex flex-wrap gap-3" aria-label="Contact Request pages">
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh requests
        </Button>
        {cursor && (
          <Button variant="outline" disabled={loading} onClick={() => setCursor(undefined)}>
            First requests
          </Button>
        )}
        {next && (
          <Button disabled={loading} onClick={() => setCursor(next)}>
            Next requests
          </Button>
        )}
      </nav>
      <Link to="/tutors" className="link mt-5 inline-block">
        Find another Tutor
      </Link>
    </AuthShell>
  );
}
