import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Flag, Hash, Megaphone, Pin, Reply, Send, SmilePlus, Trash2, X } from "lucide-react";
import {
  api,
  describeFailure,
  subscribeCommunity,
  type CommunityChannel,
  type CommunityMessage,
  type CommunityOverview,
  type CommunityReaction,
  type CommunityReportCategory,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { mergeCommunityMessages } from "@/lib/community-merge";
import { Notice, useSingleFlight } from "@/components/account/ui";

const reactionGlyphs: Record<CommunityReaction, { glyph: string; label: string }> = {
  THUMBS_UP: { glyph: "👍", label: "Thumbs up" },
  HEART: { glyph: "❤️", label: "Heart" },
  LAUGH: { glyph: "😂", label: "Laugh" },
  CELEBRATE: { glyph: "🎉", label: "Celebrate" },
  THINKING: { glyph: "🤔", label: "Thinking" },
  EYES: { glyph: "👀", label: "Eyes" },
};
const reportLabels: Record<CommunityReportCategory, string> = {
  SPAM: "Spam or advertising",
  HARASSMENT: "Harassment or hate",
  CONTACT_DETAILS: "Sharing contact details",
  INAPPROPRIATE: "Inappropriate content",
  OTHER: "Something else",
};
const control = "input mt-2 w-full";
const time = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

function JoinCommunity({
  overview,
  onJoined,
}: {
  overview: CommunityOverview;
  onJoined: () => void;
}) {
  const [nickname, setNickname] = useState(""),
    [adult, setAdult] = useState(false),
    [rules, setRules] = useState(false),
    [error, setError] = useState<string>();
  const flight = useSingleFlight();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void flight.run(async () => {
      setError(undefined);
      const result = await api.joinCommunity(nickname);
      if (result.ok) onJoined();
      else setError(describeFailure(result.error));
    });
  };
  return (
    <form
      onSubmit={submit}
      className="card-surface mx-auto max-w-2xl space-y-5"
      aria-labelledby="join-title"
    >
      <div>
        <h2 id="join-title" className="text-2xl font-semibold">
          Join the community
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Talk with other members and the team while we build the platform. Pick a nickname: other
          members see it instead of your name.
        </p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <label className="block text-sm font-medium">
        Nickname
        <input
          className={control}
          required
          minLength={2}
          maxLength={30}
          value={nickname}
          autoComplete="off"
          aria-describedby="nickname-hint"
          placeholder="For example: Curious Learner"
          onChange={(event) => setNickname(event.target.value)}
        />
      </label>
      <p id="nickname-hint" className="-mt-3 text-xs text-muted-foreground">
        2–30 letters or numbers. Don't use your full name, phone number or email.
      </p>
      <section className="rounded-xl border bg-secondary/40 p-4" aria-labelledby="rules-title">
        <h3 id="rules-title" className="font-semibold">
          Community rules
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {overview.policy.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={adult}
          onChange={(event) => setAdult(event.target.checked)}
        />
        I confirm I am aged 18 or older
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={rules}
          onChange={(event) => setRules(event.target.checked)}
        />
        I agree to follow the community rules
      </label>
      <Button disabled={flight.loading || nickname.trim().length < 2 || !adult || !rules}>
        Join the community
      </Button>
    </form>
  );
}

function ReportForm({
  message,
  onDone,
}: {
  message: CommunityMessage;
  onDone: (notice: string) => void;
}) {
  const [category, setCategory] = useState<CommunityReportCategory>("SPAM"),
    [note, setNote] = useState(""),
    [error, setError] = useState<string>();
  const flight = useSingleFlight();
  return (
    <form
      className="mt-2 space-y-2 rounded-xl border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void flight.run(async () => {
          const result = await api.reportCommunity(message.id, category, note.trim() || undefined);
          if (result.ok) onDone("Thanks. The team will review this message.");
          else setError(describeFailure(result.error));
        });
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <label className="block text-xs font-medium">
        Why are you reporting this?
        <select
          aria-label="Report reason"
          className={control}
          value={category}
          onChange={(event) => setCategory(event.target.value as CommunityReportCategory)}
        >
          {(Object.keys(reportLabels) as CommunityReportCategory[]).map((value) => (
            <option key={value} value={value}>
              {reportLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium">
        Anything else? (optional)
        <input
          className={control}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={flight.loading}>
          Send report
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => onDone("")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function MessageItem({
  message,
  canReact,
  team,
  onReply,
  onChanged,
  onNotice,
}: {
  message: CommunityMessage;
  canReact: boolean;
  team: boolean;
  onReply: (message: CommunityMessage) => void;
  onChanged: (message: CommunityMessage) => void;
  onNotice: (notice: { tone: "success" | "error"; text: string }) => void;
}) {
  const [picker, setPicker] = useState(false),
    [reporting, setReporting] = useState(false),
    [busy, setBusy] = useState(false);
  const visible = message.status === "VISIBLE";
  const react = async (emoji: CommunityReaction, on: boolean) => {
    setBusy(true);
    setPicker(false);
    const result = await api.reactCommunity(message.id, emoji, on);
    setBusy(false);
    if (result.ok) onChanged(result.data.message);
    else onNotice({ tone: "error", text: describeFailure(result.error) });
  };
  const remove = async () => {
    if (!window.confirm("Delete this message for everyone?")) return;
    setBusy(true);
    const result = await api.deleteCommunityMessage(message.id);
    setBusy(false);
    if (result.ok)
      onChanged({
        ...message,
        status: "DELETED_BY_AUTHOR",
        body: null,
        reactions: [],
        pinned: false,
      });
    else onNotice({ tone: "error", text: describeFailure(result.error) });
  };
  const pin = async () => {
    const reason = window.prompt(
      `Reason for ${message.pinned ? "unpinning" : "pinning"} (10+ characters)`,
      message.pinned ? "No longer current" : "Important for members to see",
    );
    if (!reason) return;
    const result = await api.moderateCommunity(
      message.id,
      message.pinned ? "UNPIN" : "PIN",
      reason,
    );
    if (result.ok) onChanged({ ...message, pinned: !message.pinned });
    else onNotice({ tone: "error", text: describeFailure(result.error) });
  };
  return (
    <li
      className="group rounded-xl px-3 py-2 hover:bg-secondary/40"
      aria-label={`Message from ${message.author.nickname}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-semibold">{message.author.nickname}</span>
        {message.author.team && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
            Team
          </span>
        )}
        <time className="text-xs text-muted-foreground" dateTime={message.created_at}>
          {time(message.created_at)}
        </time>
        {message.pinned && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Pin className="size-3" />
            Pinned
          </span>
        )}
      </div>
      {message.reply_to && (
        <p className="mt-1 border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
          Replying to {message.reply_to.nickname}:{" "}
          {message.reply_to.excerpt ?? "message no longer available"}
        </p>
      )}
      {visible ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>
      ) : (
        <p className="mt-1 text-sm italic text-muted-foreground">
          {message.status === "REMOVED_BY_STAFF"
            ? "This message was removed by the team."
            : "This message was deleted."}
        </p>
      )}
      {visible && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              disabled={busy || !canReact}
              aria-pressed={reaction.mine}
              aria-label={`${reactionGlyphs[reaction.emoji].label}: ${reaction.count}${reaction.mine ? ", including you" : ""}`}
              onClick={() => void react(reaction.emoji, !reaction.mine)}
              className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2 text-xs ${reaction.mine ? "border-primary bg-primary/10" : "bg-background"}`}
            >
              <span aria-hidden>{reactionGlyphs[reaction.emoji].glyph}</span>
              {reaction.count}
            </button>
          ))}
          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            {canReact && (
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-secondary"
                aria-label="Add reaction"
                aria-expanded={picker}
                onClick={() => setPicker(!picker)}
              >
                <SmilePlus className="size-4" />
              </button>
            )}
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-secondary"
              aria-label={`Reply to ${message.author.nickname}`}
              onClick={() => onReply(message)}
            >
              <Reply className="size-4" />
            </button>
            {!message.author.own && (
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-secondary"
                aria-label="Report message"
                onClick={() => setReporting(!reporting)}
              >
                <Flag className="size-4" />
              </button>
            )}
            {team && (
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-secondary"
                aria-label={message.pinned ? "Unpin message" : "Pin message"}
                onClick={() => void pin()}
              >
                <Pin className="size-4" />
              </button>
            )}
            {message.author.own && (
              <button
                type="button"
                disabled={busy}
                className="rounded-lg p-1.5 hover:bg-secondary"
                aria-label="Delete message"
                onClick={() => void remove()}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {picker && (
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Choose a reaction">
          {(Object.keys(reactionGlyphs) as CommunityReaction[]).map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={reactionGlyphs[emoji].label}
              className="rounded-lg border bg-background px-2 py-1 text-lg hover:bg-secondary"
              onClick={() => void react(emoji, true)}
            >
              {reactionGlyphs[emoji].glyph}
            </button>
          ))}
        </div>
      )}
      {reporting && (
        <ReportForm
          message={message}
          onDone={(text) => {
            setReporting(false);
            if (text) onNotice({ tone: "success", text });
          }}
        />
      )}
    </li>
  );
}

function ChannelView({
  channel,
  overview,
  onRevoked,
}: {
  channel: CommunityChannel;
  overview: CommunityOverview;
  onRevoked: () => void;
}) {
  const member = overview.member!;
  const [messages, setMessages] = useState<CommunityMessage[]>(),
    [hasOlder, setHasOlder] = useState(false),
    [pins, setPins] = useState<CommunityMessage[]>([]),
    [body, setBody] = useState(""),
    [replyTo, setReplyTo] = useState<CommunityMessage>(),
    [notice, setNotice] = useState<{ tone: "success" | "error"; text: string }>(),
    [live, setLive] = useState(false),
    [generation, setGeneration] = useState(0);
  const key = useRef(crypto.randomUUID()),
    list = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    stick = useRef(true);
  const flight = useSingleFlight();
  const muted =
    member.muted_until && new Date(member.muted_until) > new Date() ? member.muted_until : null;
  const canPost = channel.can_post && !muted;
  useEffect(() => {
    let stop: (() => void) | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      active = true;
    setMessages(undefined);
    setLive(false);
    stick.current = true;
    void (async () => {
      const [page, pinned] = await Promise.all([
        api.communityMessages(channel.id),
        api.communityPins(channel.id),
      ]);
      if (!active) return;
      if (!page.ok) {
        if (page.error.kind === "http" && [401, 403, 404].includes(page.error.status)) onRevoked();
        else setNotice({ tone: "error", text: describeFailure(page.error) });
        setMessages([]);
        return;
      }
      setMessages(page.data.messages);
      setHasOlder(!!page.data.has_older);
      if (pinned.ok) setPins(pinned.data.messages);
      stop = subscribeCommunity(
        channel.id,
        page.data.cursor,
        (changes) => {
          setLive(true);
          setMessages((current) => mergeCommunityMessages(current ?? [], changes.messages));
          setPins((current) => {
            const changed = new Map(changes.messages.map((m) => [m.id, m]));
            const kept = current
              .map((m) => changed.get(m.id) ?? m)
              .filter((m) => m.pinned && m.status === "VISIBLE");
            const added = changes.messages.filter(
              (m) => m.pinned && m.status === "VISIBLE" && !kept.some((k) => k.id === m.id),
            );
            return [...added, ...kept];
          });
        },
        (revoked) => {
          setLive(false);
          if (revoked) onRevoked();
          // Resync from scratch after a dropped connection.
          else retry = setTimeout(() => active && setGeneration((value) => value + 1), 3000);
        },
      );
      setLive(true);
    })();
    return () => {
      active = false;
      clearTimeout(retry);
      stop?.();
    };
  }, [channel.id, generation, onRevoked]);
  useLayoutEffect(() => {
    const element = list.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [messages]);
  const older = () =>
    flight.run(async () => {
      const first = messages?.[0];
      if (!first) return;
      const element = list.current;
      const height = element?.scrollHeight ?? 0;
      const result = await api.communityMessages(channel.id, { before: first.id });
      if (!result.ok) {
        setNotice({ tone: "error", text: describeFailure(result.error) });
        return;
      }
      stick.current = false;
      setMessages((current) => [...result.data.messages, ...(current ?? [])]);
      setHasOlder(!!result.data.has_older);
      requestAnimationFrame(() => {
        if (element) element.scrollTop = element.scrollHeight - height;
      });
    });
  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (!body.trim()) return;
    void flight.run(async () => {
      setNotice(undefined);
      const result = await api.postCommunity(channel.id, {
        request_key: key.current,
        body,
        ...(replyTo ? { reply_to: replyTo.id } : {}),
      });
      if (result.ok) {
        key.current = crypto.randomUUID();
        setBody("");
        setReplyTo(undefined);
        stick.current = true;
        setMessages((current) => mergeCommunityMessages(current ?? [], [result.data.message]));
        composer.current?.focus();
      } else setNotice({ tone: "error", text: describeFailure(result.error) });
    });
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };
  const changed = (message: CommunityMessage) => {
    setMessages((current) => mergeCommunityMessages(current ?? [], [message]));
    setPins((current) =>
      message.pinned && message.status === "VISIBLE"
        ? [message, ...current.filter((m) => m.id !== message.id)]
        : current.filter((m) => m.id !== message.id),
    );
  };
  return (
    <section
      className="flex min-h-[70vh] min-w-0 flex-col rounded-2xl border bg-card"
      aria-labelledby="channel-title"
    >
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id="channel-title" className="flex items-center gap-1.5 text-lg font-semibold">
            {channel.staff_only_posting ? (
              <Megaphone className="size-4" />
            ) : (
              <Hash className="size-4" />
            )}
            {channel.name}
          </h2>
          <p className="text-xs text-muted-foreground">{channel.description}</p>
        </div>
        <span
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs ${live ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}
          role="status"
        >
          <span
            className={`size-2 rounded-full ${live ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
            aria-hidden
          />
          {live ? "Live" : "Connecting…"}
        </span>
      </header>
      {pins.length > 0 && (
        <details className="border-b bg-primary/5 px-4 py-2 text-sm">
          <summary className="cursor-pointer font-medium">
            <Pin className="mr-1 inline size-3.5" />
            {pins.length === 1 ? "1 pinned message" : `${pins.length} pinned messages`}
          </summary>
          <ul className="mt-2 space-y-2">
            {pins.map((message) => (
              <li key={message.id} className="text-xs">
                <span className="font-semibold">{message.author.nickname}:</span> {message.body}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div
        ref={list}
        className="max-h-[60vh] min-h-64 flex-1 overflow-y-auto px-1 py-2"
        onScroll={(event) => {
          const element = event.currentTarget;
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {hasOlder && (
          <div className="py-2 text-center">
            <Button
              size="sm"
              variant="outline"
              disabled={flight.loading}
              onClick={() => void older()}
            >
              Load earlier messages
            </Button>
          </div>
        )}
        {!messages ? (
          <p role="status" className="p-4 text-sm">
            Loading messages…
          </p>
        ) : !messages.length ? (
          <p className="p-4 text-sm text-muted-foreground">No messages yet. Say hello!</p>
        ) : (
          <ol
            className="space-y-0.5"
            aria-label={`Messages in ${channel.name}`}
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                canReact={!muted}
                team={member.team}
                onReply={(target) => {
                  setReplyTo(target);
                  composer.current?.focus();
                }}
                onChanged={changed}
                onNotice={setNotice}
              />
            ))}
          </ol>
        )}
      </div>
      <div className="border-t p-3">
        {notice && (
          <div className="mb-2">
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        )}
        {!channel.can_post ? (
          <p className="text-sm text-muted-foreground">
            Only the team posts in this channel. You can react and reply in other channels.
          </p>
        ) : muted ? (
          <p className="text-sm text-muted-foreground">
            You've been muted by the team until {time(muted)}.
          </p>
        ) : (
          <form onSubmit={send} className="space-y-2">
            {replyTo && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">
                  Replying to <strong>{replyTo.author.nickname}</strong>: {replyTo.body}
                </span>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTo(undefined)}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Message {channel.name}</span>
                <textarea
                  ref={composer}
                  className="input max-h-40 min-h-11 w-full resize-y"
                  rows={1}
                  maxLength={overview.policy.max_message_length}
                  value={body}
                  disabled={!canPost}
                  placeholder={`Message #${channel.name}`}
                  onKeyDown={keyDown}
                  onChange={(event) => {
                    setBody(event.target.value);
                    key.current = crypto.randomUUID();
                  }}
                />
              </label>
              <Button aria-label="Send message" disabled={flight.loading || !body.trim()}>
                <Send className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter to send, Shift+Enter for a new line. No phone numbers, emails or links.
              {body.length > overview.policy.max_message_length - 100
                ? ` ${body.length}/${overview.policy.max_message_length}`
                : ""}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

export function CommunityHub() {
  const [overview, setOverview] = useState<CommunityOverview>(),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState<string>(),
    [renaming, setRenaming] = useState(false),
    [nickname, setNickname] = useState("");
  const flight = useSingleFlight();
  const load = useCallback(async () => {
    const result = await api.community();
    if (result.ok) {
      setOverview(result.data);
      setSelected((current) =>
        current && result.data.channels.some((c) => c.id === current)
          ? current
          : (result.data.channels.find((c) => c.slug === "general") ?? result.data.channels[0])?.id,
      );
    } else if (result.error.kind === "http" && result.error.status === 401)
      window.location.assign("/auth/signin");
    else setError(describeFailure(result.error));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const revoked = useCallback(() => void load(), [load]);
  if (error && !overview) return <Notice tone="error">{error}</Notice>;
  if (!overview) return <p role="status">Loading the community…</p>;
  if (!overview.policy.enabled)
    return <Notice tone="info">The community is closed right now.</Notice>;
  if (!overview.member) return <JoinCommunity overview={overview} onJoined={() => void load()} />;
  const channel = overview.channels.find((c) => c.id === selected);
  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Community channels" className="min-w-0">
          <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-1 md:overflow-visible">
            {overview.channels.map((item) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={item.id === selected ? "page" : undefined}
                  onClick={() => setSelected(item.id)}
                  className={`flex min-h-10 w-full items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-left text-sm font-medium ${item.id === selected ? "bg-primary text-primary-foreground" : "border hover:bg-secondary/60 md:border-transparent"}`}
                >
                  {item.staff_only_posting ? (
                    <Megaphone className="size-4 shrink-0" />
                  ) : (
                    <Hash className="size-4 shrink-0" />
                  )}
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-3 space-y-2 rounded-xl border p-3 text-xs">
            <summary className="cursor-pointer">
              You're <strong>{overview.member.nickname}</strong>
              {overview.member.team ? " (team)" : ""}
            </summary>
            {renaming ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void flight.run(async () => {
                    const result = await api.renameCommunity(nickname);
                    if (result.ok) {
                      setRenaming(false);
                      await load();
                    } else setError(describeFailure(result.error));
                  });
                }}
              >
                <input
                  aria-label="New nickname"
                  className="input w-full"
                  minLength={2}
                  maxLength={30}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
                <Button size="sm" disabled={flight.loading || nickname.trim().length < 2}>
                  Save nickname
                </Button>
              </form>
            ) : (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setNickname(overview.member!.nickname);
                  setRenaming(true);
                }}
              >
                Change nickname
              </button>
            )}
            <button
              type="button"
              className="block underline"
              onClick={() =>
                window.confirm(
                  "Leave the community? Your messages stay, and you can rejoin later.",
                ) &&
                void flight.run(async () => {
                  const result = await api.leaveCommunity();
                  if (result.ok) await load();
                  else setError(describeFailure(result.error));
                })
              }
            >
              Leave the community
            </button>
          </details>
        </nav>
        {channel ? (
          <ChannelView key={channel.id} channel={channel} overview={overview} onRevoked={revoked} />
        ) : (
          <p>No channels yet.</p>
        )}
      </div>
    </div>
  );
}
