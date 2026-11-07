import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, MessageCircle, Send, ShieldCheck, WifiOff } from "lucide-react";
import {
  api,
  describeFailure,
  subscribeChat,
  type ApiFailure,
  type ChatMessage,
  type ChatState,
} from "@/lib/api";
import { Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

type Pending = { id: string; text: string; retry: boolean };
type Commands = {
  send: (text: string) => void;
  retry: () => void;
  older: () => void;
  mark: () => void;
};
const merge = (old: ChatMessage[], incoming: ChatMessage[]) =>
  [...new Map([...old, ...incoming].map((message) => [message.sequence, message])).values()].sort(
    (a, b) => a.sequence - b.sequence,
  );

function resizeComposer(element: HTMLTextAreaElement) {
  const style = getComputedStyle(element);
  const line = parseFloat(style.lineHeight) || 18;
  const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const border =
    (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  element.style.height = "0px";
  const maximum = line * 5 + padding + border;
  const height = Math.min(
    maximum,
    Math.max(line * 2 + padding + border, element.scrollHeight + border),
  );
  element.style.height = height + "px";
  element.style.overflowY = element.scrollHeight + border > maximum ? "auto" : "hidden";
}

export function ChatRoom({
  connectionId,
  onUnreadChange,
  onTitleChange,
}: {
  connectionId: string;
  onUnreadChange?: (id: string, unread: number) => void;
  onTitleChange?: (id: string, title: string) => void;
}) {
  const [state, setState] = useState<ChatState>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState("Checking chat access");
  const [revoked, setRevoked] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const rendered = useRef(0);
  const [below, setBelow] = useState(false);
  const commands = useRef<Commands | undefined>(undefined);
  const offerTitle = state?.offer_title;
  useEffect(() => {
    if (offerTitle) onTitleChange?.(connectionId, offerTitle);
  }, [connectionId, offerTitle, onTitleChange]);
  useLayoutEffect(() => {
    if (editor.current) resizeComposer(editor.current);
  }, [draft]);
  useEffect(() => {
    const element = editor.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined && next !== width) {
        width = next;
        resizeComposer(element);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [revoked]);

  useEffect(() => {
    let alive = true,
      denied = false,
      cursor = 0,
      loaded = false,
      syncing = false,
      readBusy = false,
      sending = false,
      loadingOlder = false,
      ownRead = 0,
      peerRead = 0,
      backoff = 1000;
    let stop: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: ChatState | undefined;
    let queued: Pending | undefined;
    let earliest = 0;
    const close = () => {
      stop?.();
      stop = undefined;
      clearTimeout(timer);
    };
    const revoke = () => {
      if (!alive) return;
      denied = true;
      close();
      current = undefined;
      queued = undefined;
      setState(undefined);
      setMessages([]);
      setDraft("");
      setPending(undefined);
      setRevoked(true);
      setError(
        "Chat access is unavailable. Your session or Connection permission may have changed.",
      );
      setStatus("Access unavailable");
    };
    const failure = (problem: ApiFailure) => {
      if (problem.kind === "http" && [401, 403, 404].includes(problem.status)) {
        revoke();
        return true;
      }
      return false;
    };
    const accept = (frame: ChatState, kind: "initial" | "forward" | "older") => {
      if (!alive || denied) return;
      if (
        frame.connection_id !== connectionId ||
        (current &&
          (current.your_role !== frame.your_role || current.learner_kind !== frame.learner_kind))
      ) {
        revoke();
        return;
      }
      if (kind === "initial") {
        cursor = frame.next_after;
        earliest = frame.messages[0]?.sequence ?? 0;
      } else if (kind === "forward") {
        for (const message of frame.messages) {
          if (message.sequence === cursor + 1) cursor = message.sequence;
          else if (message.sequence > cursor + 1) {
            close();
            schedule();
            return;
          }
        }
      } else earliest = frame.messages[0]?.sequence ?? earliest;
      const currentReadCount = frame.read_sequence >= ownRead;
      ownRead = Math.max(ownRead, frame.read_sequence);
      peerRead = Math.max(peerRead, frame.peer_read_sequence);
      current = {
        ...frame,
        read_sequence: ownRead,
        peer_read_sequence: peerRead,
        has_older: earliest > 1,
      };
      setState(current);
      if (frame.last_sequence <= ownRead) onUnreadChange?.(connectionId, 0);
      else if (currentReadCount) onUnreadChange?.(connectionId, current.unread_count);
      setMessages((old) => (kind === "initial" ? frame.messages : merge(old, frame.messages)));
    };
    const schedule = () => {
      if (!alive || denied) return;
      setStatus("Reconnecting");
      clearTimeout(timer);
      timer = setTimeout(() => void recover(), backoff);
      backoff = Math.min(backoff * 2, 15000);
    };
    const connect = () => {
      if (!alive || denied) return;
      stop = subscribeChat(
        connectionId,
        cursor,
        (frame) => {
          accept(frame, "forward");
          if (!denied) setStatus("Connected");
        },
        (unavailable) => {
          stop = undefined;
          if (unavailable) revoke();
          else schedule();
        },
      );
    };
    const recover = async () => {
      if (!alive || denied || syncing) return;
      syncing = true;
      close();
      try {
        let more = true;
        while (alive && !denied && more) {
          const response = await api.chatHistory(
            connectionId,
            loaded ? { after: cursor, limit: 100 } : {},
          );
          if (!alive || denied) return;
          if (!response.ok) {
            if (!failure(response.error)) schedule();
            return;
          }
          accept(response.data, loaded ? "forward" : "initial");
          loaded = true;
          more = response.data.has_more;
        }
        if (alive && !denied) {
          backoff = 1000;
          setStatus("Connected");
          connect();
        }
      } finally {
        syncing = false;
      }
    };
    const mark = async () => {
      if (
        !alive ||
        denied ||
        !loaded ||
        readBusy ||
        document.visibilityState !== "visible" ||
        !atBottom.current ||
        cursor <= ownRead
      )
        return;
      const through = Math.min(cursor, rendered.current);
      if (through <= ownRead) return;
      readBusy = true;
      try {
        const response = await api.readChat(connectionId, through);
        if (!alive || denied) return;
        if (response.ok) {
          onUnreadChange?.(connectionId, response.data.unread_count);
          ownRead = Math.max(ownRead, response.data.read_sequence);
          peerRead = Math.max(peerRead, response.data.peer_read_sequence);
          setState((previous) =>
            previous
              ? {
                  ...previous,
                  ...response.data,
                  read_sequence: ownRead,
                  peer_read_sequence: peerRead,
                }
              : previous,
          );
        } else failure(response.error);
      } finally {
        readBusy = false;
      }
    };
    const transmit = async () => {
      if (!alive || denied || sending || !queued) return;
      sending = true;
      queued = { ...queued, retry: false };
      const message = queued;
      setPending(message);
      setError(undefined);
      try {
        const response = await api.sendMessage(connectionId, message.id, message.text);
        if (!alive || denied) return;
        if (response.ok) {
          setMessages((old) => merge(old, [response.data.message]));
          setDraft("");
          queued = undefined;
          setPending(undefined);
          void recover();
        } else if (!failure(response.error)) {
          if (response.error.kind === "unavailable" || response.error.status >= 500) {
            queued = { ...message, retry: true };
            setPending(queued);
            setError("Delivery could not be confirmed. Retry safely with the same message.");
          } else {
            queued = undefined;
            setPending(undefined);
            setError(describeFailure(response.error));
          }
        }
      } finally {
        sending = false;
      }
    };
    const older = async () => {
      if (!alive || denied || loadingOlder || earliest <= 1) return;
      loadingOlder = true;
      setOlderBusy(true);
      const element = log.current;
      const height = element?.scrollHeight ?? 0;
      const top = element?.scrollTop ?? 0;
      atBottom.current = false;
      try {
        const response = await api.chatHistory(connectionId, { before: earliest, limit: 50 });
        if (!alive || denied) return;
        if (response.ok) {
          accept(response.data, "older");
          requestAnimationFrame(() => {
            if (element) element.scrollTop = top + element.scrollHeight - height;
          });
        } else if (!failure(response.error))
          setError("Earlier messages could not be loaded. Try again.");
      } finally {
        loadingOlder = false;
        if (alive) setOlderBusy(false);
      }
    };
    commands.current = {
      send: (text) => {
        if (!loaded || denied || queued || sending || !text.trim()) return;
        queued = { id: crypto.randomUUID(), text: text.trim(), retry: false };
        void transmit();
      },
      retry: () => void transmit(),
      older: () => void older(),
      mark: () => void mark(),
    };
    const focus = () => {
      if (document.visibilityState === "visible") {
        void recover();
        void mark();
      }
    };
    const offline = () => {
      close();
      setStatus("Offline");
    };
    window.addEventListener("online", focus);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    void recover();
    return () => {
      alive = false;
      close();
      commands.current = undefined;
      window.removeEventListener("online", focus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [connectionId, onUnreadChange]);
  useEffect(() => {
    rendered.current = messages.at(-1)?.sequence ?? 0;
    if (atBottom.current && log.current) {
      log.current.scrollTop = log.current.scrollHeight;
      commands.current?.mark();
    } else if (messages.length) setBelow(true);
  }, [messages]);
  const scroll = () => {
    const element = log.current;
    if (!element) return;
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    if (atBottom.current) {
      setBelow(false);
      commands.current?.mark();
    }
  };
  const jump = () => {
    atBottom.current = true;
    setBelow(false);
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    commands.current?.mark();
  };
  const peer =
    state?.your_role === "PAYER"
      ? "Tutor"
      : state?.learner_kind === "CHILD"
        ? "Guardian"
        : "Learner";
  return (
    <section className="messaging-chat flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="messaging-chat-strip">
        <p role="status" className="messaging-status">
          {status === "Connected" ? (
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          ) : (
            <WifiOff size={12} aria-hidden="true" />
          )}
          {status}
        </p>
        <p className="messaging-notice">
          <ShieldCheck size={14} aria-hidden="true" />
          Adult participants only. Discuss learning here; pay Tuition Fees directly to the Tutor.
          Text messages only.
        </p>
        <Link
          to="/safety/$kind/$targetId"
          params={{ kind: "connection", targetId: connectionId }}
          className="link messaging-report"
        >
          Report or block
        </Link>
      </div>
      {error && (
        <div className="px-5 pt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {revoked ? (
        <div className="space-y-3 px-5 py-12 text-center">
          <p>Messages are hidden while access is unavailable.</p>
          <Link
            to="/safety/$kind/$targetId"
            params={{ kind: "connection", targetId: connectionId }}
            className="link mb-3 block"
          >
            Report or block this account
          </Link>
          <Link to="/auth/signin" className="link">
            Sign in again
          </Link>
        </div>
      ) : (
        <>
          <div
            ref={log}
            onScroll={scroll}
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7"
          >
            {state?.has_older && (
              <div className="mb-5 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={olderBusy}
                  onClick={() => commands.current?.older()}
                >
                  {olderBusy ? "Loading earlier messages" : "Load earlier messages"}
                </Button>
              </div>
            )}
            {!messages.length && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <MessageCircle className="mb-4 text-coral-strong" size={32} />
                <p className="font-medium">
                  {state ? "Start the conversation" : "Loading conversation"}
                </p>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                  Ask about learning goals, teaching approach or suitable times.
                </p>
              </div>
            )}
            <ol className="space-y-4">
              {messages.map((message) => (
                <li
                  key={message.sequence}
                  className={`flex ${message.your_message ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[88%] sm:max-w-[75%]">
                    <p
                      className={`mb-1 text-xs text-muted-foreground ${message.your_message ? "text-right" : ""}`}
                    >
                      {message.your_message ? "You" : peer}
                    </p>
                    <div
                      className={`rounded-2xl px-4 py-3 ${message.your_message ? "rounded-br-md bg-coral-soft" : "rounded-bl-md bg-secondary"}`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                        {message.text}
                      </p>
                    </div>
                    <p
                      className={`mt-1 text-[11px] text-muted-foreground ${message.your_message ? "text-right" : ""}`}
                    >
                      <a
                        className="link mr-2"
                        href={
                          "/safety/connection/" +
                          encodeURIComponent(connectionId) +
                          "?message=" +
                          message.sequence
                        }
                        aria-label={"Report message " + message.sequence}
                      >
                        Report message {message.sequence}
                      </a>
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      {message.your_message && (
                        <>
                          {" "}
                          · {message.sequence <= (state?.peer_read_sequence ?? 0) ? "Read" : "Sent"}
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {below && (
            <div className="mb-3 text-center">
              <Button variant="outline" size="sm" onClick={jump}>
                <ArrowDown size={14} />
                Latest messages
              </Button>
            </div>
          )}
          <form
            className="messaging-composer"
            onSubmit={(event) => {
              event.preventDefault();
              commands.current?.send(draft);
            }}
          >
            <label htmlFor="chat-message" className="sr-only">
              Message
            </label>
            <textarea
              ref={editor}
              id="chat-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              rows={2}
              disabled={!state || Boolean(pending)}
              placeholder="Write a message about your learning…"
              aria-describedby="chat-hint"
              className="input messaging-input"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  commands.current?.send(draft);
                }
              }}
            />
            <div className="messaging-composer-actions">
              <p id="chat-hint" className="messaging-hint text-muted-foreground">
                {draft.length}/2000 · Shift + Enter for a new line
              </p>
              {pending?.retry ? (
                <Button type="button" onClick={() => commands.current?.retry()}>
                  Retry message
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!state || !draft.trim() || Boolean(pending)}
                  className="rounded-full px-4"
                >
                  <Send size={15} />
                  {pending ? "Sending…" : "Send message"}
                </Button>
              )}
            </div>
          </form>
        </>
      )}
    </section>
  );
}
