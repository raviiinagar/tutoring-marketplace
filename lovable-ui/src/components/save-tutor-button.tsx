import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { api, describeFailure } from "@/lib/api";
import { useSavedTutors } from "@/lib/saved-tutors";

export function SaveTutorButton({
  profileId,
  displayName,
  compact = false,
}: {
  profileId: string;
  displayName: string;
  compact?: boolean;
}) {
  const saved = useSavedTutors();
  const feedbackId = useId();
  const selected = !!saved.items?.some((item) => item.profile_id === profileId);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string>(),
    [showSignIn, setShowSignIn] = useState(false),
    [showFeedback, setShowFeedback] = useState(false),
    [failed, setFailed] = useState(false);
  const flight = useRef(false);
  useEffect(() => {
    setMessage(undefined);
    setShowSignIn(false);
    setShowFeedback(false);
  }, [saved.accountId, profileId]);
  const toggle = async () => {
    if (flight.current) return;
    setMessage(undefined);
    setFailed(false);
    setShowFeedback(true);
    if (saved.anonymous) {
      setShowSignIn((value) => !value);
      return;
    }
    if (!saved.accountId || saved.error || saved.sessionError || !saved.items) return;
    flight.current = true;
    setBusy(true);
    try {
      const result = selected
        ? await api.removeSavedTutor(profileId)
        : await api.saveTutorToShortlist(profileId);
      if (!result.ok) {
        setFailed(true);
        setMessage(describeFailure(result.error));
        return;
      }
      await saved.invalidate();
      setMessage(result.data.saved ? "Tutor saved." : "Tutor removed from saved Tutors.");
    } catch {
      setFailed(true);
      setMessage("Could not update saved Tutors. Please try again.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const issue = message || saved.sessionError || saved.error;
  const disabled = busy || saved.checkingAccount || saved.loading;
  return (
    <div className={"relative " + (compact ? "" : "inline-block")}>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={disabled}
        aria-label={`${selected ? "Remove" : "Save"} ${displayName}${selected ? " from saved Tutors" : " to saved Tutors"}`}
        aria-pressed={selected}
        aria-busy={busy || saved.loading}
        aria-expanded={showSignIn || (showFeedback && !!issue)}
        aria-controls={showSignIn || (showFeedback && issue) ? feedbackId : undefined}
        className={
          compact
            ? "flex size-11 items-center justify-center rounded-full border border-white/70 bg-white/95 text-primary shadow-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            : "inline-flex min-h-11 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold text-primary disabled:opacity-60"
        }
      >
        <Heart aria-hidden className={"size-5 " + (selected ? "fill-current" : "")} />
        {!compact && (busy ? "Saving…" : selected ? "Saved Tutor" : "Save Tutor")}
      </button>
      {(showSignIn || (showFeedback && issue)) && (
        <div
          id={feedbackId}
          className={
            compact
              ? "absolute right-0 top-12 z-30 w-64 max-w-[80vw] rounded-xl border bg-background p-4 text-sm text-foreground shadow-lg"
              : "mt-3 max-w-sm text-sm"
          }
        >
          {showSignIn ? (
            <p role="status">
              Keep your favourite Tutors in one place.{" "}
              <Link className="font-semibold underline" to="/auth/signin">
                Sign in to save this Tutor
              </Link>
              .
            </p>
          ) : (
            <p role={message && !failed ? "status" : "alert"}>{issue}</p>
          )}
          {!message && (saved.error || saved.sessionError) && (
            <button
              className="mt-2 font-semibold underline"
              type="button"
              onClick={() => void (saved.sessionError ? saved.refreshSession() : saved.refresh())}
            >
              Retry saved status
            </button>
          )}
        </div>
      )}
    </div>
  );
}
