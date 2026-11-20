import { PeerAvatar } from "@/components/peer-avatar";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Inbox, Info, MessagesSquare, RefreshCw, Search, Video } from "lucide-react";
import { api, describeFailure, type ConnectionSummary } from "@/lib/api";
import { AuthShell, Notice } from "@/components/account/ui";
import { connectionReason } from "@/components/connection-reason";
import { ChatRoom } from "@/components/chat-room";
import { ConnectionDetails } from "@/components/connection-details";
import { ClassInvitations } from "@/components/class-invitations";
import { InboxRequests } from "@/components/inbox-requests";
import { InboxNextClass } from "@/components/inbox-next-class";
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
      { title: "My messages — Tutor Marketplace" },
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
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      row.offer.title.toLowerCase().includes(needle) ||
      (row.peer?.display_name.toLowerCase().includes(needle) ?? false),
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
  const totalUnread = rows.reduce(
    (sum, row) => sum + (row.available ? (row.unread_count ?? 0) : 0),
    0,
  );
  const [tab, setTab] = useState<"chats" | "enquiries">("chats");
  const [pending, setPending] = useState(0);
  const enquiriesTab = useRef<HTMLButtonElement>(null);
  // Opening a conversation always shows the conversation list beside it.
  useEffect(() => {
    if (conversation) setTab("chats");
  }, [conversation]);
  const showEnquiries = () => {
    setTab("enquiries");
    enquiriesTab.current?.focus();
  };
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
          <p className="inbox-title" aria-hidden="true">
            My messages
            {totalUnread > 0 && <small>{totalUnread} unread</small>}
          </p>
          <div
            className="inbox-seg"
            role="tablist"
            aria-label="Show"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const next = tab === "chats" ? "enquiries" : "chats";
              setTab(next);
              document.getElementById("inbox-tab-" + next)?.focus();
            }}
          >
            <button
              type="button"
              role="tab"
              id="inbox-tab-chats"
              aria-controls="inbox-pane-chats"
              aria-selected={tab === "chats"}
              onClick={() => setTab("chats")}
            >
              <MessagesSquare aria-hidden="true" className="size-[18px]" />
              Chats
            </button>
            <button
              ref={enquiriesTab}
              type="button"
              role="tab"
              id="inbox-tab-enquiries"
              aria-controls="inbox-pane-enquiries"
              aria-selected={tab === "enquiries"}
              onClick={() => setTab("enquiries")}
            >
              <Inbox aria-hidden="true" className="size-[18px]" />
              Enquiries
              {pending > 0 && (
                <span className="inbox-unread">
                  {pending}
                  <span className="sr-only"> pending</span>
                </span>
              )}
            </button>
          </div>
          <div
            id="inbox-pane-chats"
            role="tabpanel"
            aria-labelledby="inbox-tab-chats"
            hidden={tab !== "chats"}
            className="inbox-pane"
          >
            <div className="inbox-search">
              <Search aria-hidden="true" className="inbox-search-icon size-[18px]" />
              <label htmlFor="contacts-search" className="sr-only">
                Search conversations
              </label>
              <input
                id="contacts-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or subject"
              />
              <button
                type="button"
                className="inbox-refresh"
                aria-label="Refresh Connections"
                title="Refresh Connections"
                disabled={loading}
                onClick={() => void load()}
              >
                <RefreshCw aria-hidden="true" className="size-[18px]" />
              </button>
            </div>
            {loading && (
              <p role="status" className="inbox-note">
                Loading Connections…
              </p>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {!loading && !error && !filtered.length && <p className="inbox-note">No results</p>}
            <ul aria-label="Conversation list" className="inbox-list">
              {filtered.map((row) => (
                <li key={row.id}>
                  <Link
                    to="/connections"
                    search={{ conversation: row.id }}
                    resetScroll={false}
                    data-connection={row.id}
                    aria-current={conversation === row.id ? "true" : undefined}
                    className={`reference-contact-row${row.peer ? " reference-contact-row-peer" : ""}`}
                  >
                    {row.peer && <PeerAvatar peer={row.peer} className="size-11 text-base" />}
                    <span className="reference-contact-text">
                      <strong>{row.peer ? row.peer.display_name : row.offer.title}</strong>
                      {row.peer && (
                        <small className="reference-contact-ad">{row.offer.title}</small>
                      )}
                      {!row.available ? (
                        <small>{connectionReason(row.unavailable_reason)}</small>
                      ) : row.unread_count === null ? (
                        <small>Open messages</small>
                      ) : row.unread_count === 0 ? (
                        <small className="sr-only">0 unread messages</small>
                      ) : null}
                    </span>
                    {row.available && !!row.unread_count && (
                      <small className="inbox-unread">
                        {row.unread_count}
                        <span className="sr-only"> unread messages</span>
                      </small>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {!loading && !error && !rows.length && !teachingWorkspace && (
              <Link to="/tutors" className="ws-btn ws-btn-primary inbox-find md:hidden">
                Search for a teacher
              </Link>
            )}
            {(cursor || next) && (
              <nav aria-label="Connection pages" className="inbox-pages">
                {cursor && (
                  <button
                    type="button"
                    className="ws-btn ws-btn-soft ws-btn-sm"
                    disabled={loading}
                    onClick={() => setCursor(undefined)}
                  >
                    First Connections
                  </button>
                )}
                {next && (
                  <button
                    type="button"
                    className="ws-btn ws-btn-soft ws-btn-sm"
                    disabled={loading}
                    onClick={() => setCursor(next)}
                  >
                    Next Connections
                  </button>
                )}
              </nav>
            )}
          </div>
          <div
            id="inbox-pane-enquiries"
            role="tabpanel"
            aria-labelledby="inbox-tab-enquiries"
            hidden={tab !== "enquiries"}
            className="inbox-pane"
          >
            <InboxRequests
              key={String(teachingWorkspace)}
              tutor={teachingWorkspace}
              onAccepted={openAccepted}
              onPendingChange={setPending}
            />
            <div className="inbox-more">
              <Link to="/requests" className="ws-link">
                My class requests
              </Link>
              {teachingWorkspace && (
                <Link to="/tutor/requests" className="ws-link">
                  Enquiries from learners
                </Link>
              )}
            </div>
          </div>
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
                  className="messaging-back"
                  aria-label="Back to conversations"
                >
                  <ChevronLeft size={24} aria-hidden="true" />
                </Link>
                {selected?.peer && (
                  <PeerAvatar peer={selected.peer} className="messaging-avatar size-11 text-base" />
                )}
                <div className="messaging-heading">
                  <h2 className="messaging-title" title={title} tabIndex={0}>
                    {selected?.peer ? selected.peer.display_name : title}
                  </h2>
                  {selected?.peer && <p className="messaging-subtitle">{title}</p>}
                </div>
                <nav aria-label="Conversation sections" className="messaging-sections">
                  {(
                    [
                      ["messages", "Chat", MessagesSquare],
                      ["details", "Details", Info],
                      ["classes", "Classes", Video],
                    ] as const
                  ).map(([section, label, Icon]) => (
                    <Link
                      key={section}
                      to="/connections"
                      search={{ conversation, view: section === "messages" ? undefined : section }}
                      resetScroll={false}
                      aria-current={view === section ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      {label}
                    </Link>
                  ))}
                </nav>
              </header>
              <div className="messaging-pane-body" key={"body-" + conversation}>
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
                    banner={<InboxNextClass connectionId={conversation} />}
                  />
                )}
              </div>
            </>
          ) : (
            !loading &&
            !error && (
              <div className="inbox-empty">
                <span className="inbox-empty-tile" aria-hidden="true">
                  <MessagesSquare className="size-7" />
                </span>
                <h2>{rows.length ? "Choose a conversation" : "No messages yet"}</h2>
                <p>
                  {rows.length
                    ? "Pick someone on the left to read their messages, see their enquiry and plan your next class."
                    : teachingWorkspace
                      ? "No conversations yet. Accepted enquiries appear here."
                      : "You haven't found a teacher yet. Search for a teacher to start your learning journey."}
                </p>
                {!rows.length && teachingWorkspace && (
                  <a
                    href="#inbox-requests"
                    className="ws-btn ws-btn-ink ws-btn-sm"
                    onClick={(event) => {
                      event.preventDefault();
                      showEnquiries();
                    }}
                  >
                    View pending requests
                  </a>
                )}
                {!teachingWorkspace && !rows.length && (
                  <Link to="/tutors" className="ws-btn ws-btn-primary ws-btn-sm">
                    Search for a teacher
                  </Link>
                )}
              </div>
            )
          )}
        </section>
      </div>
    </AuthShell>
  );
}
