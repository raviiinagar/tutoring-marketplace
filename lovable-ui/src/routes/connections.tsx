import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeFailure, type ConnectionSummary } from "@/lib/api";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { connectionReason } from "@/components/connection-reason";
export const Route = createFileRoute("/connections")({
  ssr: false,
  component: Connections,
  head: () => ({
    meta: [
      { title: "Your Connections — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
export function Connections() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ConnectionSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const r = await api.connections(cursor);
    if (r.ok) {
      setRows(r.data.connections);
      setNext(r.data.next_cursor || undefined);
    } else if (r.error.kind === "http" && r.error.status === 401) {
      setRows([]);
      setNext(undefined);
      void navigate({ to: "/auth/signin", replace: true });
      return;
    }
    else setError(describeFailure(r.error));
    setLoading(false);
  }, [cursor, navigate]);
  useEffect(() => {
    void load();
  }, [load]);
  const [search, setSearch] = useState("");
  const filtered = rows.filter((row) =>
    row.offer.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <AuthShell title="My messages" reference dashboard fullWidth>
      <div className="reference-inbox">
        <aside className="reference-inbox-sidebar" aria-label="Contacts">
          <label htmlFor="contacts-search" className="font-semibold text-sm">
            All my contacts
          </label>
          <input
            className="mt-3"
            id="contacts-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts"
          />
          {!loading && !error && !filtered.length && <p className="py-5 text-sm">No results</p>}
          {filtered.map((row) => (
            <Link
              key={row.id}
              to={row.available ? "/chat/$connectionId" : "/connections/$connectionId"}
              params={{ connectionId: row.id }}
              className="reference-contact-row"
            >
              <strong>{row.offer.title}</strong>
              <small>
                {row.available
                  ? row.unread_count === null
                    ? "Open messages"
                    : `${row.unread_count} unread messages`
                  : connectionReason(row.unavailable_reason)}
              </small>
            </Link>
          ))}
          <Link to="/requests" className="reference-subtle-link mt-5 inline-block">
            My class requests
          </Link>
        </aside>
        <section className="reference-inbox-main" aria-label="Messages">
          {error && (
            <div className="mt-4">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
          {loading ? (
            <p role="status" className="mt-5">
              Loading Connections…
            </p>
          ) : (
            !error && (
              <div className="reference-inbox-notice">
                <h2>{rows.length ? "Your conversations" : "No message"}</h2>
                <p>
                  {rows.length
                    ? "Choose a conversation to read messages and arrange your next class."
                    : "You haven't found a teacher yet. Search for a teacher to start your learning journey."}
                </p>
              </div>
            )
          )}
          <Button asChild className="reference-inbox-cta">
            <Link to="/tutors">Search for a teacher</Link>
          </Button>
        </section>
      </div>
      <nav aria-label="Connection pages" className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh Connections
        </Button>
        {cursor && (
          <Button variant="outline" disabled={loading} onClick={() => setCursor(undefined)}>
            First Connections
          </Button>
        )}
        {next && (
          <Button disabled={loading} onClick={() => setCursor(next)}>
            Next Connections
          </Button>
        )}
      </nav>
      <Link to="/requests" className="link mt-5 inline-block">
        Your Contact Requests
      </Link>
    </AuthShell>
  );
}
