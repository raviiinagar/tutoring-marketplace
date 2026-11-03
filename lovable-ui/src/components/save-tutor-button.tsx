import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import { Heart, Check, X } from "lucide-react";
import { api, describeFailure } from "@/lib/api";
import { useSavedTutors } from "@/lib/saved-tutors";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";
import { Button } from "./ui/button";
import { TutorPortrait } from "./tutor-portrait";

export function SaveTutorButton({
  profileId,
  displayName,
  photoUrl,
  compact = false,
  onSavedChange,
}: {
  profileId: string;
  displayName: string;
  photoUrl?: string | undefined;
  compact?: boolean;
  onSavedChange?: ((saved: boolean) => void) | undefined;
}) {
  const saved = useSavedTutors();
  const identity = `${saved.accountId ?? "anonymous"}:${profileId}`;
  const feedbackId = useId();
  const [confirmed, setConfirmed] = useState<{ identity: string; saved: boolean }>();
  const selected =
    confirmed?.identity === identity
      ? confirmed.saved
      : !!saved.items?.some((item) => item.profile_id === profileId);
  const [feedbackFor, setFeedbackFor] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [showSignIn, setShowSignIn] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    flight = useRef(false);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const mutationKey = ["saved-tutor-update", saved.accountId, profileId];
  const update = useMutation({
    mutationKey,
    gcTime: 0,
    mutationFn: async (remove: boolean) => {
      const startedFor = identity;
      const result = await (remove
        ? api.removeSavedTutor(profileId)
        : api.saveTutorToShortlist(profileId));
      if (result.ok && startedFor === currentIdentity.current) {
        setConfirmed({ identity: startedFor, saved: result.data.saved });
        await saved.invalidate();
      }
      return result;
    },
  });
  const busy = useIsMutating({ mutationKey, exact: true }) > 0;
  useEffect(() => {
    setMessage(undefined);
    setConfirmed(undefined);
    setShowSignIn(false);
    setShowFeedback(false);
  }, [identity]);
  useEffect(() => {
    if (saved.items) setConfirmed(undefined);
  }, [saved.items]);
  const toggle = async () => {
    if (flight.current || busy) return;
    setFeedbackFor(identity);
    setMessage(undefined);
    setFailed(false);
    setShowFeedback(false);
    if (saved.anonymous) {
      setShowSignIn(true);
      return;
    }
    if (saved.error || saved.sessionError) {
      setShowFeedback(true);
      return;
    }
    if (!saved.accountId || !saved.items) return;
    const startedFor = identity;
    flight.current = true;
    try {
      const result = await update.mutateAsync(selected);
      if (startedFor !== currentIdentity.current) return;
      if (!result.ok) {
        setFailed(true);
        setMessage(describeFailure(result.error));
        setShowFeedback(true);
        return;
      }
      setMessage(
        result.data.saved
          ? `${displayName} added to your saved Tutors.`
          : `${displayName} removed from your saved Tutors.`,
      );
      setShowFeedback(true);
      onSavedChange?.(result.data.saved);
    } catch {
      if (startedFor === currentIdentity.current) {
        setFailed(true);
        setMessage("Could not update saved Tutors. Please try again.");
        setShowFeedback(true);
      }
    } finally {
      flight.current = false;
    }
  };
  const issue = message || saved.sessionError || saved.error;
  const disabled = busy || saved.checkingAccount || saved.loading;
  return (
    <>
      <Popover
        open={feedbackFor === identity && showFeedback && !!issue}
        onOpenChange={setShowFeedback}
      >
        <PopoverAnchor asChild>
          <button
            ref={trigger}
            type="button"
            onClick={() => void toggle()}
            disabled={disabled}
            aria-label={`${selected ? "Remove" : "Save"} ${displayName}${selected ? " from saved Tutors" : " to saved Tutors"}`}
            aria-pressed={selected}
            aria-busy={busy || saved.loading}
            aria-haspopup="dialog"
            aria-expanded={showSignIn || (showFeedback && !!issue)}
            aria-controls={showFeedback && issue ? feedbackId : undefined}
            title={selected ? "Remove from saved Tutors" : "Save Tutor"}
            data-saved={selected}
            className={compact ? "teacher-save-button" : "tutor-save-action"}
          >
            <Heart aria-hidden className={"size-5 " + (selected ? "fill-current" : "")} />
            {!compact && (busy ? "Updating..." : selected ? "Saved Tutor" : "Save Tutor")}
          </button>
        </PopoverAnchor>
        <PopoverContent
          id={feedbackId}
          aria-label="Saved Tutor update"
          align="end"
          className="saved-tutor-feedback"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={() => trigger.current?.focus()}
        >
          <button
            type="button"
            aria-label="Dismiss saved Tutor message"
            className="saved-feedback-close"
            onClick={() => setShowFeedback(false)}
          >
            <X aria-hidden className="size-4" />
          </button>
          {message && !failed && <Check aria-hidden className="mb-2 size-5 text-success" />}
          <p role={message && !failed ? "status" : "alert"}>{issue}</p>
          {message && !failed && selected && (
            <Link className="mt-3 inline-block font-semibold underline" to="/saved-tutors">
              View saved Tutors
            </Link>
          )}
          {(saved.error || saved.sessionError) && (
            <>
              <p className="mt-2 text-xs">Saved status could not be refreshed.</p>
              <button
                className="mt-2 font-semibold underline"
                type="button"
                onClick={() => void (saved.sessionError ? saved.refreshSession() : saved.refresh())}
              >
                Retry saved status
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
      <Dialog open={feedbackFor === identity && showSignIn} onOpenChange={setShowSignIn}>
        <DialogContent
          className="save-tutor-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <div className="save-tutor-avatar">
            <span aria-hidden>
              {displayName
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
            <TutorPortrait url={photoUrl} name={displayName} />
          </div>
          <div className="text-center">
            <DialogTitle className="text-2xl">Save {displayName} for later</DialogTitle>
            <DialogDescription className="mt-3">
              Keep your favourite teachers together, across devices. Saving is free and does not
              send an enquiry.
            </DialogDescription>
          </div>
          <Button asChild className="rounded-full">
            <Link to="/auth/signin">Sign in to save this Tutor</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/auth/signup">Create an account</Link>
          </Button>
          <button
            type="button"
            className="py-2 text-sm text-muted-foreground"
            onClick={() => setShowSignIn(false)}
          >
            Keep browsing
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
