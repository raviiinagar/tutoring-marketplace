import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronUp, ImagePlus, Inbox, Lightbulb, MessageSquareWarning } from "lucide-react";
import {
  api,
  describeFailure,
  type FeedbackCategory,
  type FeedbackItem,
  type FeedbackOperation,
  type FeedbackPolicy,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackSuggestion,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Notice, useSingleFlight } from "@/components/account/ui";

const control = "input mt-2 w-full";
const categoryLabels: Record<FeedbackCategory, string> = {
  BUG: "Bug",
  SUGGESTION: "Suggestion",
  FEATURE_REQUEST: "Feature request",
  UI_UX: "Design or usability (UI/UX)",
};
const statusLabels: Record<FeedbackStatus, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};
const priorityLabels: Record<FeedbackPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
const outcomeLabels: Record<string, string> = {
  CREATED: "Feedback sent",
  STATUS_CHANGED: "Status changed",
  PRIORITY_CHANGED: "Priority changed",
  REPLIED: "Reply from the team",
  NOTE_ADDED: "Staff note",
  HIDDEN: "Hidden from the board",
  UNHIDDEN: "Shown on the board again",
};

const isPublic = (category: FeedbackCategory) =>
  category === "SUGGESTION" || category === "FEATURE_REQUEST";
const when = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const tone =
    status === "RESOLVED"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      : status === "NEW"
        ? "bg-secondary text-secondary-foreground"
        : "bg-primary/10 text-primary";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {statusLabels[status]}
    </span>
  );
}

// Screenshots are shrunk and re-encoded in the browser so phone captures fit the 1 MiB limit.
async function prepareScreenshot(file: File, maxBytes: number) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG or JPEG screenshot.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((done) =>
      canvas.toBlob(done, "image/jpeg", quality),
    );
    if (blob && blob.size <= maxBytes) {
      const data = await new Promise<string>((done, fail) => {
        const reader = new FileReader();
        reader.onload = () => done(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => fail(new Error("We couldn't read that image."));
        reader.readAsDataURL(blob);
      });
      return { media_type: "image/jpeg" as const, data, preview: URL.createObjectURL(blob) };
    }
  }
  throw new Error("That screenshot is too large. Try a smaller one.");
}

function Timeline({ item, staff = false }: { item: FeedbackItem; staff?: boolean }) {
  return (
    <ol className="space-y-3" aria-label="Feedback history">
      {item.events?.map((event) => (
        <li
          key={event.id}
          className={`rounded-xl border p-3 text-sm ${event.visibility === "INTERNAL" ? "border-dashed bg-secondary/50" : ""}`}
        >
          <p className="font-semibold">
            {outcomeLabels[event.outcome] ?? event.outcome}
            {event.status ? `: ${statusLabels[event.status]}` : ""}
            {event.priority ? `: ${priorityLabels[event.priority]}` : ""}
            {event.visibility === "INTERNAL" ? " · Staff only" : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{when(event.created_at)}</p>
          {event.message && <p className="mt-2 whitespace-pre-wrap break-words">{event.message}</p>}
          {staff && event.reason && (
            <p className="mt-2 break-words text-xs">Reason: {event.reason}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function SendFeedback({
  policy,
  onSent,
}: {
  policy: FeedbackPolicy;
  onSent: (item: FeedbackItem) => void;
}) {
  const [category, setCategory] = useState<FeedbackCategory>("BUG"),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [shot, setShot] = useState<{ media_type: "image/jpeg"; data: string; preview: string }>(),
    [error, setError] = useState<string>(),
    [sent, setSent] = useState<string>();
  const key = useRef(crypto.randomUUID()),
    flight = useSingleFlight();
  const changed = () => {
    key.current = crypto.randomUUID();
    setSent(undefined);
  };
  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.preview);
    },
    [shot],
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void flight.run(async () => {
      setError(undefined);
      const result = await api.createFeedback({
        request_key: key.current,
        category,
        title,
        description,
        ...(shot ? { screenshot: { media_type: shot.media_type, data: shot.data } } : {}),
      });
      if (result.ok) {
        setSent(
          isPublic(category)
            ? "Thanks! Your idea is now on the suggestion board, where other members can upvote it."
            : "Thanks! Your report was sent to our team. Follow its progress under My feedback.",
        );
        setTitle("");
        setDescription("");
        setShot(undefined);
        key.current = crypto.randomUUID();
        onSent(result.data.feedback);
      } else setError(describeFailure(result.error));
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" aria-labelledby="send-feedback-title">
      <h2 id="send-feedback-title" className="text-lg font-semibold">
        Tell us what you found
      </h2>
      {sent && <Notice tone="success">{sent}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <fieldset>
        <legend className="text-sm font-medium">What kind of feedback is it?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {policy.categories.map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${category === value ? "border-primary bg-primary/5" : ""}`}
            >
              <input
                type="radio"
                name="feedback-category"
                value={value}
                checked={category === value}
                onChange={() => {
                  setCategory(value);
                  changed();
                }}
              />
              {categoryLabels[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {isPublic(category)
          ? "Suggestions and feature requests appear on the members' board without your name. Don't include contact details or links."
          : "Bug and UI/UX reports are private to you and our team."}
      </p>
      <label className="block text-sm font-medium">
        Title
        <input
          className={control}
          required
          minLength={5}
          maxLength={120}
          value={title}
          placeholder={
            category === "BUG"
              ? "For example: Search button does nothing on my phone"
              : "A short summary"
          }
          onChange={(event) => {
            setTitle(event.target.value);
            changed();
          }}
        />
      </label>
      <label className="block text-sm font-medium">
        Details
        <textarea
          className={control + " min-h-32"}
          required
          minLength={10}
          maxLength={2000}
          value={description}
          placeholder={
            category === "BUG"
              ? "What did you do, what did you expect, and what happened instead?"
              : "Tell us what you'd like and why."
          }
          onChange={(event) => {
            setDescription(event.target.value);
            changed();
          }}
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          {description.trim().length}/2000
        </span>
      </label>
      {policy.screenshots_enabled && (
        <div className="space-y-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 text-sm font-medium hover:bg-secondary/50">
            <ImagePlus className="size-4" />
            {shot ? "Replace screenshot" : "Add a screenshot (optional)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setError(undefined);
                prepareScreenshot(file, policy.max_screenshot_bytes)
                  .then((next) => {
                    setShot(next);
                    changed();
                  })
                  .catch((reason: Error) => setError(reason.message));
              }}
            />
          </label>
          {shot && (
            <div className="flex items-start gap-3">
              <img
                src={shot.preview}
                alt="Screenshot to send"
                className="max-h-40 rounded-lg border object-contain"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShot(undefined);
                  changed();
                }}
              >
                Remove screenshot
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Location data is removed. The screenshot is deleted once we resolve your report. Crop
            out other people's details first.
          </p>
        </div>
      )}
      <Button
        disabled={flight.loading || title.trim().length < 5 || description.trim().length < 10}
      >
        {flight.loading ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}

function SuggestionBoard() {
  const [sort, setSort] = useState<"top" | "new">("top"),
    [rows, setRows] = useState<FeedbackSuggestion[]>(),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState<string>();
  useEffect(() => {
    let active = true;
    setRows(undefined);
    void api.feedbackBoard(sort).then((result) => {
      if (!active) return;
      if (result.ok) setRows(result.data.suggestions);
      else {
        setRows([]);
        setError(describeFailure(result.error));
      }
    });
    return () => {
      active = false;
    };
  }, [sort]);
  const vote = async (row: FeedbackSuggestion) => {
    setBusy(row.id);
    setError(undefined);
    const result = await api.voteFeedback(row.id, !row.voted);
    setBusy(undefined);
    if (result.ok)
      setRows((current) =>
        current?.map((item) => (item.id === row.id ? { ...item, ...result.data } : item)),
      );
    else setError(describeFailure(result.error));
  };
  return (
    <section className="space-y-4" aria-labelledby="board-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="board-title" className="text-lg font-semibold">
          Suggestion board
        </h2>
        <div
          className="inline-flex rounded-full border p-1"
          role="group"
          aria-label="Sort suggestions"
        >
          {(["top", "new"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
              className={`min-h-9 rounded-full px-4 text-sm font-medium ${sort === value ? "bg-primary text-primary-foreground" : ""}`}
            >
              {value === "top" ? "Most votes" : "Newest"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Upvote the ideas you want most. You can take your vote back at any time.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows ? (
        <p role="status">Loading suggestions…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">
          No suggestions yet. Be the first to share an idea.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="flex gap-3 rounded-2xl border p-4">
              <button
                type="button"
                aria-pressed={row.voted}
                aria-label={`${row.voted ? "Remove your vote for" : "Upvote"} ${row.title}`}
                disabled={busy === row.id}
                onClick={() => void vote(row)}
                className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold ${row.voted ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary/60"}`}
              >
                <ChevronUp className="size-4" />
                {row.vote_count}
              </button>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words font-semibold">{row.title}</h3>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {categoryLabels[row.category]} · {when(row.created_at)}
                  {row.own ? " · Your idea" : ""}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{row.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyFeedback({
  rows,
  onRefresh,
}: {
  rows: FeedbackItem[] | undefined;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<FeedbackItem>(),
    [image, setImage] = useState<string>(),
    [error, setError] = useState<string>();
  const flight = useSingleFlight();
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  const open = (id: string) =>
    flight.run(async () => {
      setError(undefined);
      setImage(undefined);
      const result = await api.feedbackItem(id);
      if (!result.ok) {
        setSelected(undefined);
        setError(describeFailure(result.error));
        return;
      }
      setSelected(result.data.feedback);
      if (result.data.feedback.has_screenshot) {
        const shot = await api.feedbackScreenshot(id);
        if (shot.ok) setImage(URL.createObjectURL(shot.data));
      }
    });
  return (
    <section className="space-y-4" aria-labelledby="mine-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mine-title" className="text-lg font-semibold">
          My feedback
        </h2>
        <Button
          variant="outline"
          disabled={flight.loading}
          onClick={() => void flight.run(onRefresh)}
        >
          Refresh
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!rows ? (
        <p role="status">Loading your feedback…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">You haven't sent any feedback yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                disabled={flight.loading}
                onClick={() => void open(row.id)}
                aria-label={`Open feedback ${row.title}`}
                className={`w-full rounded-xl border p-4 text-left transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === row.id ? "border-primary" : ""}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-sm font-semibold">{row.title}</span>
                  <StatusBadge status={row.status} />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {categoryLabels[row.category]} · {when(row.created_at)}
                  {row.public
                    ? row.hidden
                      ? " · Hidden from the board"
                      : ` · On the board · ${row.vote_count} ${row.vote_count === 1 ? "vote" : "votes"}`
                    : " · Private"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <article className="space-y-4 rounded-2xl border p-5" aria-label="Feedback details">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-xl font-semibold">{selected.title}</h3>
            <StatusBadge status={selected.status} />
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {selected.description}
          </p>
          {image && (
            <img
              src={image}
              alt="Screenshot you sent"
              className="max-h-80 rounded-lg border object-contain"
            />
          )}
          <Timeline item={selected} />
        </article>
      )}
    </section>
  );
}

type Tab = "send" | "board" | "mine";
export function FeedbackHub() {
  const [policy, setPolicy] = useState<FeedbackPolicy>(),
    [rows, setRows] = useState<FeedbackItem[]>(),
    [tab, setTab] = useState<Tab>("send"),
    [error, setError] = useState<string>();
  const load = async () => {
    const result = await api.myFeedback();
    if (result.ok) {
      setRows(result.data.feedback);
      setPolicy(result.data.policy);
    } else {
      setRows([]);
      setError(describeFailure(result.error));
    }
  };
  useEffect(() => {
    let active = true;
    void api.feedbackPolicy().then((result) => {
      if (!active) return;
      if (result.ok) {
        setPolicy(result.data);
        if (result.data.enabled) void load();
      } else setError(describeFailure(result.error));
    });
    return () => {
      active = false;
    };
  }, []);
  if (error && !policy) return <Notice tone="error">{error}</Notice>;
  if (!policy) return <p role="status">Loading…</p>;
  if (!policy.enabled)
    return (
      <Notice tone="info">
        Beta feedback is closed right now. For help with your account, use Support.
      </Notice>
    );
  const tabs: { id: Tab; label: string; icon: typeof Lightbulb }[] = [
    { id: "send", label: "Send feedback", icon: MessageSquareWarning },
    { id: "board", label: "Suggestion board", icon: Lightbulb },
    { id: "mine", label: `My feedback${rows?.length ? ` (${rows.length})` : ""}`, icon: Inbox },
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">{policy.notice}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Feedback sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`feedback-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`feedback-panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium ${tab === item.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary/60"}`}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`feedback-panel-${tab}`} aria-labelledby={`feedback-tab-${tab}`}>
        {tab === "send" && (
          <SendFeedback
            policy={policy}
            onSent={(item) => setRows((current) => [item, ...(current ?? [])])}
          />
        )}
        {tab === "board" && <SuggestionBoard />}
        {tab === "mine" && <MyFeedback rows={rows} onRefresh={load} />}
      </div>
    </div>
  );
}

const operationLabels: Record<FeedbackOperation, string> = {
  SET_STATUS: "Change status",
  SET_PRIORITY: "Set priority (staff only)",
  REPLY: "Reply to the member",
  NOTE: "Add a staff-only note",
  HIDE: "Hide from the suggestion board",
  UNHIDE: "Show on the suggestion board again",
};
export function FeedbackOperations() {
  const [reason, setReason] = useState(""),
    [status, setStatus] = useState<FeedbackStatus | "">(""),
    [category, setCategory] = useState<FeedbackCategory | "">(""),
    [priority, setPriority] = useState<FeedbackPriority | "">(""),
    [rows, setRows] = useState<FeedbackItem[]>(),
    [selected, setSelected] = useState<FeedbackItem>(),
    [image, setImage] = useState<string>(),
    [operation, setOperation] = useState<FeedbackOperation>("SET_STATUS"),
    [nextStatus, setNextStatus] = useState<FeedbackStatus>("REVIEWING"),
    [nextPriority, setNextPriority] = useState<FeedbackPriority>("MEDIUM"),
    [message, setMessage] = useState(""),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const flight = useSingleFlight();
  const reasonReady = reason.trim().length >= 10;
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image);
    },
    [image],
  );
  const fail = (failure: Parameters<typeof describeFailure>[0]) => {
    setError(describeFailure(failure));
    if (failure.kind === "http" && (failure.status === 401 || failure.status === 403)) {
      setRows(undefined);
      setSelected(undefined);
      setImage(undefined);
    }
  };
  const loadQueue = () =>
    flight.run(async () => {
      setError(undefined);
      const result = await api.feedbackQueue(reason, {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(priority ? { priority } : {}),
      });
      if (result.ok) setRows(result.data.feedback);
      else fail(result.error);
    });
  const inspect = (id: string) =>
    flight.run(async () => {
      setError(undefined);
      setNotice(undefined);
      setImage(undefined);
      const result = await api.inspectFeedback(id, reason);
      if (result.ok) {
        setSelected(result.data.feedback);
        setMessage("");
      } else fail(result.error);
    });
  const viewScreenshot = () =>
    selected &&
    flight.run(async () => {
      const result = await api.inspectFeedbackScreenshot(selected.id, reason);
      if (result.ok) setImage(URL.createObjectURL(result.data));
      else fail(result.error);
    });
  const act = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void flight.run(async () => {
      setError(undefined);
      const result = await api.actFeedback(selected.id, {
        revision: selected.revision,
        operation,
        reason,
        ...(operation === "SET_STATUS" ? { status: nextStatus } : {}),
        ...(operation === "SET_PRIORITY" ? { priority: nextPriority } : {}),
        ...(message.trim() ? { message } : {}),
      });
      if (result.ok) {
        setSelected(result.data.feedback);
        setMessage("");
        setNotice("Saved.");
        if (!result.data.feedback.has_screenshot) setImage(undefined);
        setRows((current) =>
          current?.map((row) =>
            row.id === selected.id ? { ...row, ...result.data.feedback } : row,
          ),
        );
      } else fail(result.error);
    });
  };
  const needsMessage = operation === "REPLY" || operation === "NOTE";
  const operations = (Object.keys(operationLabels) as FeedbackOperation[]).filter(
    (value) =>
      (value !== "HIDE" && value !== "UNHIDE") ||
      (selected?.public && (value === "HIDE") !== selected.hidden),
  );
  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      <form
        className="space-y-4 rounded-2xl border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void loadQueue();
        }}
      >
        <label className="block text-sm font-medium">
          Reason for opening feedback
          <input
            className={control}
            required
            minLength={10}
            maxLength={240}
            value={reason}
            placeholder="For example: Weekly beta feedback triage"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Status
            <select
              aria-label="Status"
              className={control}
              value={status}
              onChange={(event) => setStatus(event.target.value as FeedbackStatus | "")}
            >
              <option value="">Any status</option>
              {(Object.keys(statusLabels) as FeedbackStatus[]).map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Category
            <select
              aria-label="Category"
              className={control}
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory | "")}
            >
              <option value="">Any category</option>
              {(Object.keys(categoryLabels) as FeedbackCategory[]).map((value) => (
                <option key={value} value={value}>
                  {categoryLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Priority
            <select
              aria-label="Priority"
              className={control}
              value={priority}
              onChange={(event) => setPriority(event.target.value as FeedbackPriority | "")}
            >
              <option value="">Any priority</option>
              {(Object.keys(priorityLabels) as FeedbackPriority[]).map((value) => (
                <option key={value} value={value}>
                  {priorityLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button disabled={flight.loading || !reasonReady}>Load feedback</Button>
      </form>
      {rows && (
        <section className="space-y-2" aria-label="Feedback queue">
          <h2 className="font-semibold">
            {rows.length
              ? `${rows.length} ${rows.length === 1 ? "item" : "items"}`
              : "No feedback matches these filters."}
          </h2>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={flight.loading || !reasonReady}
                  onClick={() => void inspect(row.id)}
                  aria-label={`Inspect feedback ${row.title}`}
                  className={`w-full rounded-xl border p-4 text-left hover:bg-secondary/50 ${selected?.id === row.id ? "border-primary" : ""}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-semibold">{row.title}</span>
                    <StatusBadge status={row.status} />
                    {row.priority && (
                      <span className="text-xs font-semibold">
                        {priorityLabels[row.priority]} priority
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {categoryLabels[row.category]} · {when(row.created_at)}
                    {row.public
                      ? ` · ${row.vote_count} ${row.vote_count === 1 ? "vote" : "votes"}${row.hidden ? " · Hidden" : ""}`
                      : " · Private"}
                    {row.has_screenshot ? " · Screenshot" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {selected && (
        <article className="space-y-4 rounded-2xl border p-5" aria-label="Selected feedback">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-xl font-semibold">{selected.title}</h2>
            <StatusBadge status={selected.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {categoryLabels[selected.category]} ·{" "}
            {selected.priority ? `${priorityLabels[selected.priority]} priority` : "No priority"} ·
            revision {selected.revision}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {selected.description}
          </p>
          {selected.has_screenshot && !image && (
            <Button
              type="button"
              variant="outline"
              disabled={flight.loading || !reasonReady}
              onClick={() => void viewScreenshot()}
            >
              View screenshot (recorded with your reason)
            </Button>
          )}
          {image && (
            <img
              src={image}
              alt="Screenshot sent with this feedback"
              className="max-h-96 rounded-lg border object-contain"
            />
          )}
          <Timeline item={selected} staff />
          <form onSubmit={act} className="space-y-3 border-t pt-4">
            {notice && <Notice tone="success">{notice}</Notice>}
            <label className="block text-sm font-medium">
              Action
              <select
                aria-label="Action"
                className={control}
                value={operation}
                onChange={(event) => setOperation(event.target.value as FeedbackOperation)}
              >
                {operations.map((value) => (
                  <option key={value} value={value}>
                    {operationLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            {operation === "SET_STATUS" && (
              <label className="block text-sm font-medium">
                New status
                <select
                  aria-label="New status"
                  className={control}
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as FeedbackStatus)}
                >
                  {(Object.keys(statusLabels) as FeedbackStatus[]).map((value) => (
                    <option key={value} value={value} disabled={value === selected.status}>
                      {statusLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {operation === "SET_PRIORITY" && (
              <label className="block text-sm font-medium">
                Priority
                <select
                  aria-label="New priority"
                  className={control}
                  value={nextPriority}
                  onChange={(event) => setNextPriority(event.target.value as FeedbackPriority)}
                >
                  {(Object.keys(priorityLabels) as FeedbackPriority[]).map((value) => (
                    <option key={value} value={value}>
                      {priorityLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {operation !== "SET_PRIORITY" && (
              <label className="block text-sm font-medium">
                {operation === "NOTE"
                  ? "Staff-only note"
                  : needsMessage
                    ? "Message to the member"
                    : "Message to the member (optional)"}
                <textarea
                  className={control + " min-h-24"}
                  maxLength={2000}
                  required={needsMessage}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>
            )}
            {operation === "SET_STATUS" && nextStatus === "RESOLVED" && selected.has_screenshot && (
              <p className="text-xs text-muted-foreground">Resolving deletes the screenshot.</p>
            )}
            <Button
              disabled={
                flight.loading ||
                !reasonReady ||
                (needsMessage && message.trim().length < 2) ||
                (operation === "SET_STATUS" && nextStatus === selected.status)
              }
            >
              Save action
            </Button>
          </form>
        </article>
      )}
    </div>
  );
}
