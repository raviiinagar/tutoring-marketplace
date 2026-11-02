import { useRef, useState } from "react";
import { Share2 } from "lucide-react";

export const tutorProfileUrl = (origin: string, profileId: string) =>
  new URL("/profiles/" + encodeURIComponent(profileId), origin).href;

export function ShareTutorButton({
  profileId,
  displayName,
}: {
  profileId: string;
  displayName: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState<string>(),
    [manual, setManual] = useState<string>();
  const flight = useRef(false);
  const share = async () => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setMessage(undefined);
    setManual(undefined);
    const url = tutorProfileUrl(window.location.origin, profileId);
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: `${displayName} — Tutor profile`, url });
          setMessage("Profile shared.");
          return;
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "name" in error &&
            error.name === "AbortError"
          )
            return;
        }
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(url);
        setMessage("Profile link copied.");
      } catch {
        setManual(url);
        setMessage("Copy the profile link below to share it.");
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <div>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-semibold disabled:opacity-60"
        type="button"
        disabled={busy}
        onClick={() => void share()}
      >
        <Share2 aria-hidden className="size-4" />
        {busy ? "Opening share options…" : "Share profile"}
      </button>
      {message && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {manual && (
        <label className="mt-3 block max-w-md text-sm">
          Profile link
          <input
            className="input mt-2 w-full"
            aria-label="Profile link"
            readOnly
            value={manual}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
