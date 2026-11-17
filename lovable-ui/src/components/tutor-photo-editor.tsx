import { useRef, useState } from "react";
import { describeFailure } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTutorApi } from "@/lib/tutor-api";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import { useAccountPhoto, updateAccountPhoto } from "@/lib/account-photo";
import { Button } from "@/components/ui/button";

export function TutorPhotoEditor() {
  const { user } = useTutorAccount();
  const client = useQueryClient();
  const tutorApi = useTutorApi();
  // On the staff onboarding page (ADR0018) the photo belongs to the Tutor, not the
  // signed-in team member, so it is loaded through the same calls the wizard uses.
  const assisted = tutorApi.scope !== "own";
  const ownPhoto = useAccountPhoto(assisted ? null : user);
  const assistedPhoto = useQuery({
    queryKey: ["tutor-photo", tutorApi.scope],
    enabled: assisted,
    retry: false,
    gcTime: 0,
    queryFn: async () => {
      const result = await tutorApi.tutorPhoto();
      if (result.ok) return result.data;
      throw new Error("Could not load the Tutor's profile photo.");
    },
  });
  const photoQuery = assisted ? assistedPhoto : ownPhoto;
  const state = photoQuery.data;
  const [file, setFile] = useState<File>();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const { loading, run } = useSingleFlight();
  const load = async () => {
    setError(undefined);
    const result = await photoQuery.refetch();
    if (result.isError) setError("Could not load your profile photo. Please try again.");
  };
  // Not a <form>: the ad wizard renders this editor inside its own form, and a nested
  // form submitted natively, reloading the page instead of uploading.
  const upload = () => {
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      if (!file || !consent) return;
      if (
        !state ||
        file.size > state.policy.max_bytes ||
        !state.policy.media_types.includes(file.type)
      ) {
        setError("Choose a JPEG or PNG of at most 1 MiB.");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let value = "";
      for (let i = 0; i < bytes.length; i += 32768)
        value += String.fromCharCode(...bytes.subarray(i, i + 32768));
      const result = await tutorApi.uploadTutorPhoto(file.type, btoa(value));
      if (result.ok) {
        setConsent(false);
        setFile(undefined);
        if (input.current) input.current.value = "";
        if (user && !assisted)
          updateAccountPhoto(client, user.id, { ...state, photo: result.data.photo });
        await load();
        setNotice("Portrait uploaded. Check its scan and Trust review status below.");
      } else setError(describeFailure(result.error));
    });
  };
  return (
    <section className="onboarding-section space-y-4" aria-labelledby="tutor-photo-title">
      <h2 id="tutor-photo-title" className="font-semibold">
        Public Tutor photo
      </h2>
      {(error || photoQuery.isError) && (
        <Notice tone="error">
          {error || "Could not load your profile photo. Please try again."}
        </Notice>
      )}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!state && <p role="status">Loading photo status…</p>}
      {state && (
        <>
          <p className="text-sm text-muted-foreground">
            {state.policy.notice} We crop portraits to 4:5 and remove location metadata. Photo
            review is separate from identity evidence.
          </p>
          {state.policy.test_only ? (
            <Notice tone="info">
              Fictional testing only. Use a fictional image fixture; real photo scanning will be
              enabled with the production scanner.
            </Notice>
          ) : !state.policy.uploads_enabled ? (
            <Notice tone="info">Photo uploads are unavailable until scanning is configured.</Notice>
          ) : null}
          {state.photo && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm">
                <strong>
                  Photo:{" "}
                  {state.photo.self_published &&
                  state.photo.status === "PENDING" &&
                  state.photo.scan_status === "CLEAN"
                    ? "Ready for your public profile"
                    : {
                        PENDING: "Uploaded — waiting for Trust review",
                        APPROVED: "Approved for eligible teaching offers",
                        REJECTED: "Not approved",
                        REMOVED: "Removed",
                      }[state.photo.status]}
                </strong>
                <span className="mt-1 block">
                  Scan:{" "}
                  {
                    {
                      CLEAN: "Passed",
                      REJECTED: "Rejected — upload a replacement",
                      ERROR: "Failed — upload a replacement",
                    }[state.photo.scan_status]
                  }
                </span>
              </p>
              {state.photo.self_published &&
                state.photo.status === "PENDING" &&
                state.photo.scan_status === "CLEAN" && (
                  <p className="text-sm text-muted-foreground">
                    Your portrait is ready to appear when your profile is online. Identity
                    verification is separate.
                  </p>
                )}
              {state.photo.status === "PENDING" && !state.photo.self_published && (
                <p className="text-sm text-muted-foreground">
                  Your portrait is saved. It will appear publicly only after approval on an eligible
                  teaching offer.
                </p>
              )}
              {state.photo.scan_status === "CLEAN" &&
                ["PENDING", "APPROVED"].includes(state.photo.status) && (
                  <img
                    src={tutorApi.photoPreviewUrl(state.photo.id)}
                    alt="Your submitted Tutor portrait"
                    className="aspect-[4/5] w-40 rounded-xl object-cover"
                  />
                )}
              {state.photo.review_reason && (
                <p className="text-sm">Review: {state.photo.review_reason}</p>
              )}
              <Button
                variant="outline"
                disabled={loading}
                onClick={() =>
                  void run(async () => {
                    setError(undefined);
                    setNotice(undefined);
                    const result = await tutorApi.removeTutorPhoto(state.photo!.id);
                    if (result.ok) {
                      if (user && !assisted)
                        updateAccountPhoto(client, user.id, { ...state, photo: null });
                      await load();
                      setNotice("Portrait removed.");
                    } else setError(describeFailure(result.error));
                  })
                }
              >
                Remove photo
              </Button>
            </div>
          )}
          <div className="space-y-3">
            <label className="block text-sm font-semibold">
              Portrait image
              <input
                ref={input}
                aria-label="Portrait image"
                type="file"
                accept="image/jpeg,image/png"
                disabled={loading || !state.policy.uploads_enabled}
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setConsent(false);
                }}
                className="mt-2 block max-w-full text-sm"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                disabled={loading}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {assisted
                ? "This is the Tutor's own adult portrait, which they sent us and agreed to show publicly once scanning passes."
                : "This is my own adult portrait, and I agree to display it publicly once scanning passes."}
            </label>
            <Button
              type="button"
              onClick={upload}
              disabled={loading || !file || !consent || !state.policy.uploads_enabled}
            >
              {loading
                ? "Uploading…"
                : state.policy.auto_publication
                  ? "Upload photo"
                  : "Upload photo for review"}
            </Button>
          </div>
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            Refresh photo status
          </Button>
        </>
      )}
    </section>
  );
}
