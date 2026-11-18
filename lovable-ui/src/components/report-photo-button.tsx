import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { api, describeFailure } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

type Reason = Parameters<typeof api.reportTutorPhoto>[1];
const reasons: { value: Reason; label: string }[] = [
  { value: "NOT_A_PORTRAIT", label: "It is not a photo of a person" },
  { value: "NOT_THE_TUTOR", label: "It is not this Tutor" },
  { value: "INAPPROPRIATE", label: "It is inappropriate" },
  { value: "OTHER", label: "Something else" },
];

/**
 * With staff photo review off (ADR0021), signed-in visitors report an unsuitable photo and
 * our team reviews it in Portrait reviews.
 */
export function ReportPhotoButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>();
  const [done, setDone] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [error, setError] = useState<string>();
  const { loading, run } = useSingleFlight();
  const ids = useId();

  if (done)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Thank you. Our team will review this photo.
      </p>
    );
  if (!open)
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        <Flag aria-hidden className="size-3" />
        Report photo
      </button>
    );
  const submit = () =>
    void run(async () => {
      if (!reason) return setError("Choose a reason.");
      setError(undefined);
      const result = await api.reportTutorPhoto(profileId, reason);
      if (result.ok) return setDone(true);
      if (result.error.kind === "http" && result.error.status === 401) return setSignIn(true);
      if (result.error.kind === "http" && result.error.code === "OWN_PHOTO")
        return setError("This is your own photo. Change it in My Account.");
      setError(describeFailure(result.error));
    });
  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <fieldset className="space-y-2" disabled={loading}>
        <legend id={ids} className="text-sm font-semibold">
          What is wrong with this photo?
        </legend>
        {reasons.map((item) => (
          <label key={item.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={ids + "-reason"}
              value={item.value}
              checked={reason === item.value}
              onChange={() => setReason(item.value)}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      {signIn && (
        <Notice tone="error">
          Please{" "}
          <Link to="/auth/signin" className="underline">
            sign in
          </Link>{" "}
          to report a photo.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          disabled={loading}
          onClick={submit}
        >
          {loading ? "Sending…" : "Send report"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
