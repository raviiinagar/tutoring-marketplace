import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, describeFailure, type TutorPhotoState } from "@/lib/api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

export function TutorPhotoEditor() {
  const [state, setState] = useState<TutorPhotoState>();
  const [file, setFile] = useState<File>();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const { loading, run } = useSingleFlight();
  const load = async () => {
    setError(undefined);
    const result = await api.tutorPhoto();
    if (result.ok) setState(result.data);
    else setError(describeFailure(result.error));
  };
  useEffect(() => {
    void load();
  }, []);
  const upload = (event: FormEvent) => {
    event.preventDefault();
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
      const result = await api.uploadTutorPhoto(file.type, btoa(value));
      if (result.ok) {
        setConsent(false);
        setFile(undefined);
        if (input.current) input.current.value = "";
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
      {error && <Notice tone="error">{error}</Notice>}
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
                  {
                    {
                      PENDING: "Uploaded — waiting for Trust review",
                      APPROVED: "Approved for eligible teaching offers",
                      REJECTED: "Not approved",
                      REMOVED: "Removed",
                    }[state.photo.status]
                  }
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
              {state.photo.status === "PENDING" && (
                <p className="text-sm text-muted-foreground">
                  Your portrait is saved. It will appear publicly only after approval on an eligible
                  teaching offer.
                </p>
              )}
              {state.photo.scan_status === "CLEAN" &&
                ["PENDING", "APPROVED"].includes(state.photo.status) && (
                  <img
                    src={api.photoPreviewUrl(state.photo.id)}
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
                    const result = await api.removeTutorPhoto(state.photo!.id);
                    if (result.ok) {
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
          <form onSubmit={upload} className="space-y-3">
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
              This is my own adult portrait, and I agree to display it publicly after approval.
            </label>
            <Button
              type="submit"
              disabled={loading || !file || !consent || !state.policy.uploads_enabled}
            >
              {loading ? "Uploading…" : "Upload photo for review"}
            </Button>
          </form>
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            Refresh photo status
          </Button>
        </>
      )}
    </section>
  );
}
