import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ExternalLink } from "lucide-react";
import {
  api,
  describeFailure,
  type ClassInvitation,
  type ClassInvitations as ClassState,
} from "@/lib/api";
import { Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value)) + " IST";
function inputTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function useClasses(connectionId: string) {
  const [state, setState] = useState<ClassState>();
  const [error, setError] = useState<string>();
  const alive = useRef(true);
  const load = useCallback(async () => {
    const result = await api.classes(connectionId);
    if (!alive.current) return;
    if (result.ok) {
      setState(result.data);
      setError(undefined);
    } else {
      if (result.error.kind === "http" && [401, 403, 404].includes(result.error.status))
        setState(undefined);
      setError(
        result.error.kind === "http" && result.error.status === 404
          ? "Class scheduling is unavailable for this Connection."
          : describeFailure(result.error),
      );
    }
  }, [connectionId]);
  useEffect(() => {
    alive.current = true;
    void load();
    const focus = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 15000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  return { state, error, load, setState };
}

export function ClassInvitations({ connectionId }: { connectionId: string }) {
  const { state, error: loadError, load, setState } = useClasses(connectionId);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [editing, setEditing] = useState<ClassInvitation | null>();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [url, setUrl] = useState("");
  const [verifiedJoin, setVerifiedJoin] = useState<{ id: string; revision: number; url: string }>();
  const requestKey = useRef(crypto.randomUUID());
  const { loading, run } = useSingleFlight();
  const teacher = state?.viewer_role === "TUTOR";
  useEffect(() => {
    if (!state) {
      setVerifiedJoin(undefined);
      setEditing(undefined);
      setTitle("");
      setUrl("");
      setTime("");
    }
  }, [state]);
  const edit = (item?: ClassInvitation) => {
    setError(undefined);
    setNotice(undefined);
    setEditing(item ?? null);
    setTitle(item?.title ?? "");
    setTime(item ? inputTime(item.starts_at) : "");
    setDuration(String(item?.duration_minutes ?? 60));
    setUrl(item?.meet_url ?? "");
    requestKey.current = crypto.randomUUID();
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      const date = new Date(time + "+05:30");
      if (!time || !Number.isFinite(date.getTime())) {
        setError("Choose a valid class date and time in IST.");
        return;
      }
      const details = {
        title,
        starts_at: date.toISOString(),
        duration_minutes: Number(duration),
        meet_url: url,
      };
      const result = editing
        ? await api.editClass(connectionId, editing.id, details, editing.revision)
        : await api.createClass(connectionId, details, requestKey.current);
      if (result.ok) {
        setNotice(
          editing
            ? "Class changes saved. The Learner can see the updated time."
            : "Class scheduled and saved. The Learner can see it in this Connection.",
        );
        setEditing(undefined);
        setVerifiedJoin(undefined);
        await load();
      } else {
        setError(describeFailure(result.error));
        if (result.error.kind === "http" && [401, 403, 404].includes(result.error.status))
          setState(undefined);
        else await load();
      }
    });
  };
  const cancel = (item: ClassInvitation) =>
    run(async () => {
      setError(undefined);
      setNotice(undefined);
      setVerifiedJoin(undefined);
      const result = await api.cancelClass(connectionId, item.id, item.revision);
      if (result.ok) {
        setNotice("Class cancelled. Its Join button is no longer available.");
        setEditing(undefined);
        await load();
      } else {
        setError(describeFailure(result.error));
        await load();
      }
    });
  const join = (item: ClassInvitation) =>
    run(async () => {
      setError(undefined);
      setVerifiedJoin(undefined);
      const popup = window.open("about:blank", "_blank");
      if (popup) {
        popup.opener = null;
        const meta = popup.document.createElement("meta");
        meta.name = "referrer";
        meta.content = "no-referrer";
        popup.document.head.appendChild(meta);
        popup.document.title = "Opening Google Meet";
        popup.document.body.textContent = "Opening Google Meet…";
      }
      const result = await api.joinClass(connectionId, item.id);
      if (result.ok) {
        if (popup && !popup.closed) popup.location.replace(result.data.url);
        else setVerifiedJoin({ id: item.id, revision: item.revision, url: result.data.url });
      } else {
        popup?.close();
        setError(describeFailure(result.error));
        await load();
      }
    });
  return (
    <section
      id="classes"
      className="mt-6 space-y-4 rounded-2xl border p-5"
      aria-labelledby="classes-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="classes-title" className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="size-5" />
          Classes &amp; Google Meet
        </h2>
        {teacher && editing === undefined && (
          <Button onClick={() => edit()} disabled={loading}>
            Schedule class
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Agree the time with each other in chat. Classes open in Google Meet; tuition is arranged
        directly with your Tutor.
      </p>
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!state && !loadError && <p role="status">Loading saved classes…</p>}
      {state && (
        <>
          {!state.classes.length && (
            <p className="rounded-xl bg-muted/30 p-4 text-sm">
              No classes scheduled yet.{" "}
              {teacher
                ? "Use Schedule class to add a time and your Google Meet link."
                : "Ask your Tutor to schedule a class here."}
            </p>
          )}
          <div className="space-y-3">
            {state.classes.map((item) => {
              const past = new Date(item.ends_at).getTime() < new Date(state.server_time).getTime();
              const started =
                new Date(item.starts_at).getTime() <= new Date(state.server_time).getTime();
              return (
                <article key={item.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">{item.title}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${item.status === "CANCELLED" ? "bg-muted text-muted-foreground" : "bg-success-soft text-success"}`}
                    >
                      {item.status === "CANCELLED"
                        ? "Cancelled"
                        : past
                          ? "Scheduled time passed"
                          : item.revision > 1
                            ? "Updated · Scheduled"
                            : "Saved · Scheduled"}
                    </span>
                  </div>
                  <p className="text-sm">
                    {dateTime(item.starts_at)} · {item.duration_minutes} minutes
                  </p>
                  {item.status === "SCHEDULED" && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={loading || !item.can_join}
                          onClick={() => void join(item)}
                        >
                          Join class <ExternalLink className="size-4" />
                        </Button>
                        {teacher && !started && (
                          <Button variant="outline" disabled={loading} onClick={() => edit(item)}>
                            Reschedule / edit
                          </Button>
                        )}
                        {teacher && (
                          <Button
                            variant="outline"
                            disabled={loading}
                            onClick={() => void cancel(item)}
                          >
                            Cancel class
                          </Button>
                        )}
                      </div>
                      {!item.can_join && (
                        <p className="text-xs text-muted-foreground">
                          {past
                            ? "The joining window has ended. This status does not confirm attendance."
                            : "Join opens 15 minutes before class and closes 15 minutes after its scheduled end."}
                        </p>
                      )}
                    </>
                  )}
                  {verifiedJoin?.id === item.id &&
                    verifiedJoin.revision === item.revision &&
                    item.can_join &&
                    item.status === "SCHEDULED" && (
                      <a
                        href={verifiedJoin.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link inline-block text-sm"
                      >
                        Popup blocked? Open Google Meet
                      </a>
                    )}
                </article>
              );
            })}
          </div>
          {teacher && editing !== undefined && (
            <form onSubmit={save} className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <h3 className="font-semibold">{editing ? "Update class" : "Schedule a class"}</h3>
              <Field
                label="Class title"
                value={title}
                required
                minLength={5}
                maxLength={120}
                hint="For example: Physics — Newton’s laws. 5–120 characters."
                onChange={(e) => setTitle(e.target.value)}
              />
              <Field
                label="Class date and time (IST)"
                type="datetime-local"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                hint="India Standard Time. Confirm this time with your Learner in chat."
              />
              <Field
                label="Class duration (minutes)"
                type="number"
                min={15}
                max={240}
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <Field
                label="Google Meet link"
                type="url"
                value={url}
                required
                maxLength={1000}
                onChange={(e) => setUrl(e.target.value)}
                hint="Paste an existing link, such as https://meet.google.com/abc-defg-hij. We do not create a meeting automatically."
              />
              <a
                href="https://meet.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="link inline-flex items-center gap-2 text-sm"
              >
                Open Google Meet to create a link <ExternalLink className="size-4" />
              </a>
              <p className="text-xs text-muted-foreground">
                Create a meeting for later in Google Meet, copy its link and paste it above. Your
                Google account controls admission. Saving here does not start or record a video
                call.
              </p>
              <SubmitButton loading={loading} loadingText="Saving class…">
                {editing ? "Save class changes" : "Save scheduled class"}
              </SubmitButton>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setEditing(undefined)}
              >
                Discard changes
              </Button>
            </form>
          )}
        </>
      )}
      <Button variant="outline" disabled={loading} onClick={() => void load()}>
        Refresh class status
      </Button>
    </section>
  );
}

export function UpcomingClass({ connectionId }: { connectionId: string }) {
  const { state } = useClasses(connectionId);
  const upcoming = state?.classes
    .filter((c) => c.status === "SCHEDULED" && new Date(c.ends_at) >= new Date(state.server_time))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  return (
    <div className="mt-3 rounded-xl border bg-muted/20 px-4 py-3 text-sm">
      <Link
        to="/connections/$connectionId"
        params={{ connectionId }}
        hash="classes"
        className="link font-semibold"
      >
        {upcoming ? "View class & join Google Meet" : "Classes & Google Meet"}
      </Link>
      {upcoming && (
        <p className="mt-1 text-xs text-muted-foreground">
          {upcoming.title} · {dateTime(upcoming.starts_at)}
        </p>
      )}
    </div>
  );
}
