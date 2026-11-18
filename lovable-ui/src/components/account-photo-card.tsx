import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeFailure, type User } from "@/lib/api";
import { useAccountPhoto, updateAccountPhoto } from "@/lib/account-photo";
import { AccountAvatar } from "@/components/account-avatar";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

/**
 * One profile photo for the whole account (ADR0021): added and removed here by Learners and
 * Tutors alike, and shown publicly only on a published Tutor profile and its ads.
 */
export function AccountPhotoCard({ user, className }: { user: User; className: string }) {
  const client = useQueryClient();
  const query = useAccountPhoto(user);
  const state = query.data;
  const photo =
    state?.photo && state.photo.status !== "REMOVED" && state.photo.status !== "REJECTED"
      ? state.photo
      : null;
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const { loading, run } = useSingleFlight();

  const upload = (file: File) =>
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      if (
        !state ||
        file.size > state.policy.max_bytes ||
        !state.policy.media_types.includes(file.type)
      ) {
        setError("Choose a JPEG or PNG photo of at most 1 MB.");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let value = "";
      for (let i = 0; i < bytes.length; i += 32768)
        value += String.fromCharCode(...bytes.subarray(i, i + 32768));
      const result = await api.uploadTutorPhoto(file.type, btoa(value));
      if (input.current) input.current.value = "";
      if (!result.ok) return setError(describeFailure(result.error));
      updateAccountPhoto(client, user.id, { ...state, photo: result.data.photo });
      await query.refetch();
      setConsent(false);
      setNotice(
        result.data.photo.scan_status === "CLEAN"
          ? "Photo updated."
          : "That photo could not be used. Try another one.",
      );
    });
  const remove = () =>
    void run(async () => {
      if (!photo || !state) return;
      setError(undefined);
      setNotice(undefined);
      const result = await api.removeTutorPhoto(photo.id);
      if (!result.ok) return setError(describeFailure(result.error));
      updateAccountPhoto(client, user.id, { ...state, photo: null });
      await query.refetch();
      setNotice("Photo removed.");
    });

  return (
    <section className={className} aria-labelledby="photo-title">
      <h2 id="photo-title" className="mb-7 text-center text-base font-bold">
        Profile photo
      </h2>
      <div className="relative mx-auto flex aspect-square w-full max-w-52 items-center justify-center rounded-[56px] bg-[#f1f1f1]">
        <AccountAvatar
          user={user}
          className="absolute inset-0 h-full w-full rounded-[56px] text-5xl text-muted-foreground"
        />
      </div>
      <div className="mt-6 space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}
        {state && !state.policy.uploads_enabled ? (
          <p className="text-sm text-muted-foreground">
            Photo uploads are not available right now.
          </p>
        ) : (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                disabled={loading}
                onChange={(event) => setConsent(event.target.checked)}
              />
              This is a clear photo of me. If I publish a teaching ad, it appears on my public
              profile.
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                className="rounded-full"
                disabled={loading || !consent || !state}
                onClick={() => input.current?.click()}
              >
                {photo ? "Change photo" : "Upload photo"}
              </Button>
              {photo && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={loading}
                  onClick={remove}
                >
                  Remove photo
                </Button>
              )}
            </div>
            <span className="relative block h-0 overflow-hidden">
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png"
                aria-label="Profile photo file"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload(file);
                }}
              />
            </span>
          </>
        )}
      </div>
    </section>
  );
}
