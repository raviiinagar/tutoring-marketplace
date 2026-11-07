import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api, describeFailure, type ConnectionSummary } from "@/lib/api";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { connectionReason } from "@/components/connection-reason";
import { ChatRoom } from "@/components/chat-room";
import { ConnectionDetails } from "@/components/connection-details";
import { ClassInvitations } from "@/components/class-invitations";
import { InboxRequests } from "@/components/inbox-requests";
import { useTutorAccount } from "@/lib/tutor-dashboard";

export type InboxView = "messages" | "details" | "classes";
export function inboxSearch(search: Record<string, unknown>): {
  conversation?: string | undefined;
  view?: InboxView | undefined;
} {
  return {
    conversation:
      typeof search["conversation"] === "string" && search["conversation"].length <= 128
        ? search["conversation"]
        : undefined,
    view: search["view"] === "details" || search["view"] === "classes" ? search["view"] : undefined,
  };
}
export const Route = createFileRoute("/connections")({
  ssr: false,
  validateSearch: inboxSearch,
  component: InboxRoute,
  head: () => ({
    meta: [
      { title: "My messages â€” Tutor Marketplace" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});
function InboxRoute() {
  const { conversation, view } = Route.useSearch();
  const { user } = useTutorAccount();
  return (
    <Connections
      conversation={conversation}
      view={view}
      teachingWorkspace={user?.roles.includes("TUTOR") ?? false}
    />
  );
}
export function Connections({
  conversation,
  view = "messages",
  teachingWorkspace = false,
}: {
  conversation?: string | undefined;
  view?: InboxView | undefined;
  teachingWorkspace?: boolean;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ConnectionSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const reads = useRef(new Map<string, { version: number; unread: number }>());
  const readVersion = useRef(0);
  const load = useCallback(
    async (refresh = false) => {
      const attempt = ++generation.current;
      const requestedAt = readVersion.current;
      if (!refresh) setLoading(true);
      const result = await api.connections(cursor);
      if (attempt !== generation.current) return;
      if (result.ok) {
        setRows(
          result.data.connections.map((row) => {
            const latest = reads.current.get(row.id);
            return latest && latest.version > requestedAt
              ? { ...row, unread_count: latest.unread }
              : row;
          }),
        );
        setNext(result.data.next_cursor || undefined);
        setError(undefined);
      } else if (result.error.kind === "http" && result.error.status === 401) {
        setRows([]);
        setNext(undefined);
        void navigate({ to: "/auth/signin", replace: true });
      } else setError(describeFailure(result.error));
      setLoading(false);
    },
    [cursor, navigate],
  );
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const updateUnread = useCallback((id: string, unread: number) => {
    // A list request started before this read must not restore an obsolete count.
    reads.current.set(id, { version: ++readVersion.current, unread });
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, unread_count: unread } : row)),
    );
  }, []);
  const openAccepted = (connectionId: string) => {
    void load(true);
    void navigate({
      to: "/connections",
      search: { conversation: connectionId },
      resetScroll: false,
    });
  };
  const [loadedTitle, setLoadedTitle] = useState<{ id: string; title: string }>();
  const updateTitle = useCallback((id: string, title: string) => {
    setLoadedTitle((previous) =>
      previous?.id === id && previous.title === title ? previous : { id, title },
    );
  }, []);
  const [search, setSearch] = useState("");
  const selected = rows.find((row) => row.id === conversation);
  const title =
    selected?.offer.title ??
    (loadedTitle && loadedTitle.id === conversation ? loadedTitle.title : "Conversation");
  const filtered = rows.filter((row) =>
    row.offer.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pane = useRef<HTMLElement>(null);
  const contacts = useRef<HTMLElement>(null);
  const previous = useRef(conversation);
  useEffect(() => {
    if (conversation) pane.current?.focus();
    else if (previous.current) {
      const link = Array.from(
        contacts.current?.querySelectorAll<HTMLAnchorElement>("[data-connection]") ?? [],
      ).find((element) => element.dataset["connection"] === previous.current);
      (link ?? contacts.current?.querySelector<HTMLInputElement>("input"))?.focus();
    }
    previous.current = conversation;
  }, [conversation]);
  const unavailable = selected?.available === false;
  return (
    <AuthShell
      title="My messages"
      reference
      dashboard
      fullWidth
      teachingWorkspace={teachingWorkspace}
    >
      <div className="reference-inbox messaging-inbox" data-selected={Boolean(conversation)}>
        <aside ref={contacts} className="reference-inbox-sidebar" aria-label="Conversations">
          <InboxRequests
            key={String(teachingWorkspace)}
            tutor={teachingWorkspace}
            onAccepted={openAccepted}
          />
          <label htmlFor="contacts-search" className="text-sm font-semibold">
            All my contacts
          </label>
          <input
            id="contacts-search"
            className="mt-3"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts"
          />
          {loading && (
            <p role="status" className="py-5 text-sm">
              Loading Connectionsâ€¦
            </p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {!loading && !error && !filtered.length && <p className="py-5 text-sm">No results</p>}
          <ul aria-label="Conversation list">
            {filtered.map((row) => (
              <li key={row.id}>
                <Link
                  to="/connections"
                  search={{ conversation: row.id }}
                  resetScroll={false}
                  data-connection={row.id}
                  aria-current={conversation === row.id ? "true" : undefined}
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
              </li>
            ))}
          </ul>
          {!loading && !error && !rows.length && (
            <Button asChild className="mt-4 w-full md:hidden">
              <Link to="/tutors">Search for a teacher</Link>
            </Button>
          )}
          <nav aria-label="Connection pages" className="my-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
              Refresh Connections
            </Button>
            {cursor && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setCursor(undefined)}
              >
                First Connections
              </Button>
            )}
            {next && (
              <Button size="sm" disabled={loading} onClick={() => setCursor(next)}>
                Next Connections
              </Button>
            )}
          </nav>
          <Link to="/requests" className="link mt-3 block">
            My class requests
          </Link>
          {teachingWorkspace && (
            <Link to="/tutor/requests" className="link mt-3 block">
              Incoming Tutor enquiries
            </Link>
          )}
        </aside>
        <section
          ref={pane}
          tabIndex={-1}
          className="reference-inbox-main messaging-pane"
          aria-label={conversation ? "Selected conversation" : "Messages"}
        >
          {conversation ? (
            <>
              <header className="messaging-pane-header">
                <Link
                  to="/connections"
                  search={{}}
                  resetScroll={false}
                  className="messaging-back link"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </Link>
                <h2 className="messaging-title" title={title} tabIndex={0}>
                  {title}
                </h2>
                <nav aria-label="Conversation sections" className="messaging-sections">
                  {(
                    [
                      ["messages", "Messages"],
                      ["details", "Details"],
                      ["classes", "Classes & Google Meet"],
                    ] as const
                  ).map(([section, label]) => (
                    <Link
                      key={section}
                      to="/connections"
                      search={{ conversation, view: section === "messages" ? undefined : section }}
                      resetScroll={false}
                      aria-current={view === section ? "page" : undefined}
                      className="link"
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </header>
              <div className="messaging-pane-body" key={conversation}>
                {unavailable ? (
                  <ConnectionDetails
                    connectionId={conversation}
                    unavailableReason={selected.unavailable_reason}
                  />
                ) : view === "details" ? (
                  <ConnectionDetails connectionId={conversation} />
                ) : view === "classes" ? (
                  <div className="messaging-section">
                    <ClassInvitations connectionId={conversation} />
                    <Link
                      to="/safety/$kind/$targetId"
                      params={{ kind: "connection", targetId: conversation }}
                      className="link mt-5 block"
                    >
                      Report or block this account
                    </Link>
                  </div>
                ) : (
                  <ChatRoom
                    connectionId={conversation}
                    onUnreadChange={updateUnread}
                    onTitleChange={updateTitle}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              {!loading && !error && (
                <div className="reference-inbox-notice">
                  <h2>{rows.length ? "Your conversations" : "No message"}</h2>
                  <p>
                    {rows.length
                      ? "Choose a conversation to read messages and arrange your next class."
                      : teachingWorkspace
                        ? "No conversations yet. Accepted enquiries appear here."
                        : "You haven't found a teacher yet. Search for a teacher to start your learning journey."}
                  </p>
                  {!rows.length && teachingWorkspace && (
                    <a
                      href="#inbox-requests"
                      className="link mt-3 inline-block"
                      onClick={(event) => {
                        event.preventDefault();
                        const requests = document.getElementById("inbox-requests");
                        if (requests instanceof HTMLDetailsElement) {
                          requests.open = true;
                          requests.querySelector("summary")?.focus();
                        }
                      }}
                    >
                      View pending requests
                    </a>
                  )}
                </div>
              )}
              <Button asChild className="reference-inbox-cta">
                <Link to="/tutors">Search for a teacher</Link>
              </Button>
            </>
          )}
        </section>
      </div>
    </AuthShell>
  );
}
