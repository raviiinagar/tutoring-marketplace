import { TutorIntroductionWizard } from "./tutor-introduction-wizard";
import { useQueryClient } from "@tanstack/react-query";
import { TutorPresenceEditor } from "./tutor-presence-editor";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileCheck, ShieldCheck } from "lucide-react";
import { api, describeFailure, type TutorState, type TutorPolicy, type Catalogue } from "@/lib/api";
import { AuthShell, Notice, useSingleFlight } from "./account/ui";
import { Button } from "./ui/button";
import { TutorPhotoEditor } from "./tutor-photo-editor";
import { TutorPro } from "./tutor-pro";
import { TeamSetup } from "./team-setup";
export function TutorOnboarding() {
  const [state, setState] = useState<TutorState>(),
    [policy, setPolicy] = useState<TutorPolicy>(),
    [catalogue, setCatalogue] = useState<Catalogue>(),
    [file, setFile] = useState<File>(),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [editing, setEditing] = useState(true);
  const { loading, run } = useSingleFlight();
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const editingChosen = useRef(false);
  const apply = (next: TutorState) => {
    setState(next);
    // A legacy (version 1) profile opens straight in the unified editor so its
    // owner can finish the current introduction; a current profile shows its
    // summary first. Either way the same wizard does the editing.
    // Choose this only once: a later reload (a refresh, or StrictMode's second
    // effect run in development) must not close an editor the Tutor opened.
    if (next.profile && !editingChosen.current) {
      editingChosen.current = true;
      setEditing(next.profile.onboarding_version !== 2);
    }
  };
  const load = async () => {
    const [a, b, c] = await Promise.all([api.tutor(), api.tutorPolicy(), api.catalogue()]);
    if (a.ok) apply(a.data);
    else if (a.error.kind === "http" && a.error.code === "TUTOR_ROLE_REQUIRED")
      setState({ profile: null, claims: [], evidence: [] });
    else setError(describeFailure(a.error));
    if (b.ok) setPolicy(b.data);
    else setError(describeFailure(b.error));
    if (c.ok) setCatalogue(c.data);
    else setError(describeFailure(c.error));
  };
  useEffect(() => {
    void load();
  }, []);
  const upload = (sample = false) =>
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      let media: string, data: string;
      if (sample) {
        media = "application/pdf";
        data = btoa("%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n");
      } else {
        if (!file) return;
        if (file.size > 1048576) {
          setError("Choose one PDF, PNG or JPEG up to 1 MiB.");
          return;
        }
        media = file.type;
        data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
          reader.onerror = () => reject(new Error("File could not be read"));
          reader.readAsDataURL(file);
        });
      }
      const r = await api.submitTutorIdentity(media, data);
      if (r.ok) {
        apply(r.data);
        setFile(undefined);
        if (input.current) input.current.value = "";
        setNotice(
          r.data.upload
            ? "Upload received. Scan: " +
                r.data.upload.scan_status +
                ". Replace the file if scanning failed."
            : "ID uploaded, scan passed, and submitted for Trust review.",
        );
      } else setError(describeFailure(r.error));
    });
  const p = state?.profile,
    identity = state?.claims.find((c) => c.kind === "IDENTITY"),
    evidence = state?.evidence.find((e) => e.id === identity?.evidence_id);
  const approved = p?.identity_verified === true;
  const profilePublic = p?.eligible === true;
  return (
    <AuthShell
      wide
      title={p ? "Your Tutor profile" : "Create your teaching ad"}
      intro={
        p
          ? "Manage your introduction and teaching details. Identity verification is optional."
          : "Start with what you teach. Save your progress and publish when you are ready."
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!state ? (
        <p role="status">Loading your profile…</p>
      ) : (
        <div className="space-y-6">
          <TeamSetup hasProfile={!!p} />
          {p && (
            <ol aria-label="Profile progress" className="grid gap-3 sm:grid-cols-3">
              {[
                ["Profile saved", !!p],
                ["Ready to create an ad", !!p?.subject_ids?.length],
                ["Profile public", profilePublic],
              ].map(([label, done]) => (
                <li
                  key={String(label)}
                  className="flex items-center gap-2 rounded-xl border bg-muted/30 p-4 text-sm"
                >
                  <CheckCircle2
                    aria-hidden
                    className={done ? "size-5 text-success" : "size-5 text-muted-foreground"}
                  />
                  <span>
                    {label}: <strong>{done ? "Done" : "Pending"}</strong>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <section className={p ? "onboarding-section space-y-4" : "space-y-4"}>
            <div className="flex items-center justify-between gap-3">
              {p && <h2 className="text-lg font-semibold">1. About you</h2>}
              {p && !editing && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit profile
                </Button>
              )}
            </div>
            {!editing && p ? (
              <>
                <h3 className="text-xl font-semibold">{p.display_name}</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{p.biography}</p>
                <p className="text-sm">
                  {p.subject_ids
                    ?.map((id) => catalogue?.terms.find((t) => t.id === id)?.label || id)
                    .join(" · ")}{" "}
                  · ₹{(p.hourly_rate_paise || 0) / 100}/hour
                </p>
                <p className="text-xs text-muted-foreground">
                  Subjects, skills and experience are self-declared.
                </p>
                {profilePublic && p.public_id && (
                  <Button variant="outline" asChild>
                    <Link to="/profiles/$profileId" params={{ profileId: p.public_id }}>
                      View your public profile
                    </Link>
                  </Button>
                )}
              </>
            ) : catalogue ? (
              // One journey for everyone: new Tutors, legacy version 1 profiles
              // and current ones all edit through this wizard, seeded from any
              // saved profile. Saving never publishes.
              <TutorIntroductionWizard
                catalogue={catalogue}
                profile={p}
                onCompleted={(next, cleanupNotice) => {
                  apply(next);
                  // Before this save the photo endpoint answered "create a Tutor
                  // profile first", which is cached as no photo state; reload it so
                  // the photo section does not stay on "Loading photo status".
                  void client.refetchQueries({ queryKey: ["account-photo"] });
                  setEditing(false);
                  setNotice(
                    cleanupNotice ||
                      (p
                        ? "Introduction saved. Your ad publication is unchanged."
                        : "Introduction saved. Create your ad and publish it for free."),
                  );
                }}
              />
            ) : (
              <p role="status">Loading subjects…</p>
            )}
          </section>
          {p && (
            <>
              <section className="onboarding-section space-y-4">
                <h2 className="text-xl font-semibold">Your teaching profile</h2>
                <p className="text-sm">
                  {profilePublic
                    ? "Your profile is public."
                    : "Your introduction is saved privately. Publishing your first ad makes it public."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.identity_label || (approved ? "Identity verified" : "Identity not verified")}.
                  Identity verification is optional.
                </p>
                <Button asChild>
                  <Link to="/tutor/listings">Create or manage my ads</Link>
                </Button>
              </section>
              <details className="onboarding-section">
                <summary className="cursor-pointer font-semibold">
                  Identity verification · optional
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">
                  Your ad can go online without an identity document. Complete this optional check
                  if you want your identity to be verified.
                </p>
                <section className="mt-5 space-y-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <FileCheck aria-hidden className="size-5" />
                    Optional private identity document
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {p.identity_country === "OTHER"
                      ? "Upload your passport."
                      : "Upload your Aadhaar, passport or another government photo ID."}{" "}
                    PDF, PNG or JPEG, up to 1 MiB. Mask unnecessary identity numbers. Your ID stays
                    private; it is never your public photo.
                  </p>
                  {identity ? (
                    <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
                      <p>
                        <strong>ID uploaded</strong> ·{" "}
                        {evidence?.scan_status === "CLEAN"
                          ? "Scan passed"
                          : evidence?.scan_status || "Checking scan"}
                      </p>
                      <p>
                        Trust review:{" "}
                        <strong>
                          {p.status === "SUBMITTED"
                            ? "Waiting for review"
                            : approved
                              ? "Identity approved"
                              : identity.status}
                        </strong>
                      </p>
                      {identity.review_reason && <p>Reviewer feedback: {identity.review_reason}</p>}
                      {identity.expires_at && (
                        <p>
                          Approval valid until {new Date(identity.expires_at).toLocaleDateString()}.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        To replace this ID, edit your profile and select “Replace my identity
                        document”.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium">
                        No identity document submitted for this revision yet.
                      </p>
                      {state.evidence
                        .filter(
                          (item) =>
                            !state.claims.some((c) => c.evidence_id === item.id) &&
                            ["ERROR", "REJECTED", "QUARANTINED"].includes(item.scan_status),
                        )
                        .slice(-1)
                        .map((item) => (
                          <Notice key={item.id} tone="error">
                            Last upload: {item.scan_status}. This document was not submitted for
                            approval. Upload a replacement.
                          </Notice>
                        ))}
                      {policy?.test_only ? (
                        <Notice tone="info">
                          Fictional testing only. Do not upload a real ID.
                        </Notice>
                      ) : (
                        <>
                          <input
                            ref={input}
                            aria-label="Identity document"
                            type="file"
                            accept="application/pdf,image/png,image/jpeg"
                            disabled={loading || editing || !policy?.uploads_enabled}
                            onChange={(e) => setFile(e.target.files?.[0])}
                          />
                          {file && (
                            <p className="text-sm">
                              Selected: {file.name} · {Math.ceil(file.size / 1024)} KB
                            </p>
                          )}
                        </>
                      )}
                      <Button
                        disabled={
                          loading ||
                          editing ||
                          !policy?.uploads_enabled ||
                          (!policy.test_only && !file)
                        }
                        onClick={() => upload(!!policy?.test_only)}
                      >
                        {loading
                          ? "Uploading and submitting…"
                          : policy?.test_only
                            ? "Submit fictional ID sample"
                            : "Upload ID and submit for review"}
                      </Button>
                    </>
                  )}
                  <Button variant="outline" disabled={loading} onClick={() => void run(load)}>
                    Refresh review status
                  </Button>
                  {approved && (
                    <Notice tone="success">
                      <ShieldCheck aria-hidden className="mr-2 inline size-4" />
                      Your identity verification is current. Publication and verification are
                      separate.
                    </Notice>
                  )}
                </section>
              </details>
              <details className="onboarding-section">
                <summary className="cursor-pointer font-semibold">
                  Public profile photo · optional
                </summary>
                <p className="my-3 text-sm text-muted-foreground">
                  You can add your own portrait later. It can appear publicly once scanning passes.
                </p>
                <TutorPhotoEditor />
              </details>
              <TutorPresenceEditor />
              <TutorPro identityApproved={!!p?.adult_declared_at} />
            </>
          )}
        </div>
      )}
    </AuthShell>
  );
}
