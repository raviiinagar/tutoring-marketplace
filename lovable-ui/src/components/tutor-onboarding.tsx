import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import {
  api,
  describeFailure,
  type TutorState,
  type TutorPolicy,
  type TutorClaim,
  type TutorEvidence,
  type Catalogue,
} from "@/lib/api";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { TutorPhotoEditor } from "@/components/tutor-photo-editor";

const claimNames = {
  IDENTITY: "Identity and adult status",
  QUALIFICATION: "Subject qualification",
  EXPERIENCE: "Subject experience",
};
const statusNames: Record<string, string> = {
  DRAFT: "Draft — not submitted",
  SUBMITTED: "Submitted — waiting for Trust review",
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Not approved",
  REVOKED: "Approval withdrawn",
  EXPIRED: "Approval expired",
};
const scanNames: Record<TutorEvidence["scan_status"], string> = {
  CLEAN: "Scan passed",
  QUARANTINED: "Scan in progress",
  REJECTED: "Scan rejected",
  ERROR: "Scan failed",
  WITHDRAWN: "Withdrawn",
};

export function TutorOnboarding() {
  const [state, setState] = useState<TutorState>();
  const [policy, setPolicy] = useState<TutorPolicy>();
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [birth, setBirth] = useState("");
  const [adult, setAdult] = useState(false);
  const [file, setFile] = useState<File>();
  const [kind, setKind] = useState<TutorClaim["kind"]>("IDENTITY");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"name" | "bio" | "birth" | "adult", string>>
  >({});
  const [editing, setEditing] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const profileForm = useRef<HTMLFormElement>(null);
  const { loading, run } = useSingleFlight();
  const apply = useCallback((data: TutorState) => {
    setState(data);
    if (data.claims.some((c) => c.kind === "IDENTITY"))
      setKind((current) => (current === "IDENTITY" ? "QUALIFICATION" : current));
    if (data.profile) {
      setName(data.profile.display_name);
      setBio(data.profile.biography);
      setBirth(data.profile.birth_date);
    }
  }, []);
  const load = async () => {
    setError(undefined);
    const r = await api.tutor();
    if (r.ok) {
      if (editing) setState(r.data);
      else apply(r.data);
    } else setError(describeFailure(r.error));
  };
  useEffect(() => {
    void api.tutor().then((r) => {
      if (r.ok) apply(r.data);
      else setError(describeFailure(r.error));
    });
    void api.tutorPolicy().then((r) => {
      if (r.ok) setPolicy(r.data);
      else setError(describeFailure(r.error));
    });
    void api.catalogue().then((r) => {
      if (r.ok) setCatalogue(r.data);
      else setError(describeFailure(r.error));
    });
  }, [apply]);
  const start = () => {
    setError(undefined);
    setNotice(undefined);
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    start();
    const errors: Partial<Record<"name" | "bio" | "birth" | "adult", string>> = {};
    if (name.trim().length < 2 || name.trim().length > 80)
      errors.name = "Enter a display name between 2 and 80 characters.";
    if (bio.trim().length < 40 || bio.trim().length > 1000)
      errors.bio =
        "Write at least 40 characters about your subjects and teaching experience (maximum 1,000).";
    const date = new Date(birth + "T00:00:00Z");
    const now = new Date();
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    if (
      now.getUTCMonth() < date.getUTCMonth() ||
      (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())
    )
      age--;
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== birth ||
      age < 18 ||
      age > 110
    )
      errors.birth = "Enter a valid date of birth. Tutors must be at least 18.";
    if (!adult) errors.adult = "Tick the adult confirmation before saving.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Profile not saved. Fix the highlighted fields below.");
      requestAnimationFrame(() =>
        profileForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    void run(async () => {
      const r = await api.saveTutor(name, bio, birth, adult);
      if (r.ok) {
        apply(r.data);
        setAdult(false);
        setEditing(false);
        setNotice(
          "Profile saved. Next: upload your documents and add the two required evidence details.",
        );
      } else setError(describeFailure(r.error));
    });
  };
  const upload = (fictional = false) =>
    run(async () => {
      start();
      let data: string;
      let media: string;
      if (fictional && policy?.test_only) {
        media = "application/pdf";
        data = btoa(
          "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n% Fake identity/qualification sample for local testing only.\n%%EOF\n",
        );
      } else {
        if (!file) return;
        if (!policy || file.size > policy.max_bytes || !policy.media_types.includes(file.type)) {
          setError("Use a PDF, PNG or JPEG of at most 1 MiB.");
          return;
        }
        media = file.type;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let value = "";
        for (let i = 0; i < bytes.length; i += 32768)
          value += String.fromCharCode(...bytes.subarray(i, i + 32768));
        data = btoa(value);
      }
      const r = await api.uploadTutorEvidence(media, data);
      if (r.ok) {
        setFile(undefined);
        if (uploadInput.current) uploadInput.current.value = "";
        await load();
        setNotice(
          "Document uploaded. Check its scan status below, then choose what it proves in step 3.",
        );
      } else setError(describeFailure(r.error));
    });
  const addClaim = (event: FormEvent) => {
    event.preventDefault();
    start();
    if (description.trim().length < 10) {
      setError("Describe what this document proves in at least 10 characters.");
      return;
    }
    void run(async () => {
      const r = await api.tutorClaim(
        kind,
        description,
        evidence,
        kind === "IDENTITY" ? undefined : subject,
      );
      if (r.ok) {
        setState(r.data);
        setDescription("");
        setEvidence("");
        if (kind === "IDENTITY") setKind("QUALIFICATION");
        setNotice("Evidence details saved. Your document is linked to this profile revision.");
      } else setError(describeFailure(r.error));
    });
  };
  const submit = () =>
    run(async () => {
      start();
      const r = await api.submitTutor();
      if (r.ok) {
        setState(r.data);
        setNotice("Profile submitted. Trust will review your documents; check the results here.");
      } else setError(describeFailure(r.error));
    });
  const identity = state?.claims.some((c) => c.kind === "IDENTITY") ?? false;
  const teaching = state?.claims.some((c) => c.kind !== "IDENTITY") ?? false;
  const clean = state?.evidence.filter((e) => e.scan_status === "CLEAN") ?? [];
  const available = clean.filter((e) => !state?.claims.some((c) => c.evidence_id === e.id));
  const ready =
    identity && teaching && state?.claims.every((c) => clean.some((e) => e.id === c.evidence_id));
  const draft = state?.profile?.status === "DRAFT";
  const submitted = !!state?.profile && !draft;
  const reviewLabel = (claim: TutorClaim) =>
    draft && claim.status === "PENDING"
      ? "Saved — not submitted"
      : (statusNames[claim.status] ?? claim.status);
  const label = (item: TutorEvidence) =>
    `Document ${(state?.evidence.findIndex((e) => e.id === item.id) ?? 0) + 1} · ${item.media_type === "application/pdf" ? "PDF" : item.media_type === "image/png" ? "PNG" : "JPEG"} · ${Math.ceil(item.byte_length / 1024)} KB`;
  const steps = [
    {
      id: "profile",
      title: "Save your profile",
      done: !!state?.profile,
      detail: state?.profile ? "Saved" : "Name, biography and adult confirmation",
    },
    {
      id: "documents",
      title: "Upload private documents",
      done: clean.length >= 2,
      detail: `${state?.evidence.length ?? 0} uploaded · ${clean.length} scan passed`,
    },
    {
      id: "evidence-details",
      title: "Explain your evidence",
      done: identity && teaching,
      detail: `Identity: ${identity ? "added" : "needed"} · Teaching: ${teaching ? "added" : "needed"}`,
    },
    {
      id: "review",
      title: "Submit for review",
      done: submitted,
      detail: submitted
        ? (statusNames[state!.profile!.status] ?? state!.profile!.status)
        : "Submit after steps 1–3",
    },
  ];
  return (
    <AuthShell
      wide
      title="Your Tutor profile"
      intro="Follow these four steps. Your progress is saved to your account; you can come back later."
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/tutor/listings">Manage teaching offers</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/tutor/requests">Incoming enquiries</Link>
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!state ? (
        <div className="mt-4 space-y-3">
          <p role="status">Loading your saved progress…</p>
          <Button variant="outline" onClick={() => void load()}>
            Reload profile
          </Button>
        </div>
      ) : (
        <>
          <nav aria-label="Tutor setup progress" className="my-6 grid gap-3 sm:grid-cols-2">
            {steps.map((step, i) => (
              <a
                key={step.id}
                href={`#${step.id}`}
                className="flex gap-3 rounded-xl border p-4 hover:bg-muted/40"
              >
                {step.done ? (
                  <CheckCircle2
                    aria-label="Complete"
                    className="mt-0.5 h-5 w-5 shrink-0 text-success"
                  />
                ) : (
                  <Circle
                    aria-label="Not complete"
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  />
                )}
                <span>
                  <strong className="block text-sm">
                    {i + 1}. {step.title}
                  </strong>
                  <span className="mt-1 block text-sm text-muted-foreground">{step.detail}</span>
                </span>
              </a>
            ))}
          </nav>
          {state.profile && (
            <Notice tone={state.profile.eligible ? "success" : "info"}>
              <strong>{statusNames[state.profile.status] ?? state.profile.status}</strong>
              <p>
                {state.profile.eligible
                  ? "Profile evidence is approved. Create a teaching offer for separate publication review."
                  : draft
                    ? ready
                      ? "Your evidence details are ready. Go to step 4 to submit."
                      : "Next: " +
                        (!identity
                          ? "add identity evidence details in step 3."
                          : !teaching
                            ? "add qualification or experience details in step 3."
                            : "check your documents before submitting.")
                    : "Your profile is not yet eligible for publication. Check the review outcomes in step 4."}
              </p>
            </Notice>
          )}
          <section id="profile" className="onboarding-section space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">1. Profile details</h2>
              {state.profile && (
                <span className="rounded-full bg-success-soft px-3 py-1 text-sm text-success">
                  Saved · revision {state.profile.revision}
                </span>
              )}
            </div>
            {state.profile && !editing ? (
              <>
                <p className="font-medium">{state.profile.display_name}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {state.profile.biography}
                </p>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit profile details
                </Button>
                <p className="text-xs text-muted-foreground">
                  Editing starts a new draft. You will need to add your evidence details again and
                  resubmit.
                </p>
              </>
            ) : (
              <form ref={profileForm} onSubmit={save} noValidate className="space-y-4">
                <Field
                  label="Tutor display name"
                  value={name}
                  error={fieldErrors.name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  hint="The name learners will see. 2–80 characters."
                />
                <div className="space-y-2">
                  <label htmlFor="tutor-bio" className="block text-sm font-semibold">
                    Biography
                  </label>
                  <p id="bio-hint" className="text-sm text-muted-foreground">
                    Tell learners what you teach and about your experience. 40–1,000 characters.
                  </p>
                  <textarea
                    id="tutor-bio"
                    className="input min-h-28"
                    aria-invalid={!!fieldErrors.bio}
                    aria-describedby={`bio-hint${fieldErrors.bio ? " bio-error" : ""}`}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground">
                    {bio.trim().length}/1,000 characters
                    {bio.trim().length < 40 ? ` · ${40 - bio.trim().length} more needed` : ""}
                  </p>
                  {fieldErrors.bio && (
                    <p id="bio-error" className="text-sm text-destructive">
                      {fieldErrors.bio}
                    </p>
                  )}
                </div>
                <Field
                  label="Date of birth"
                  type="date"
                  value={birth}
                  error={fieldErrors.birth}
                  onChange={(e) => setBirth(e.target.value)}
                  hint="Private. Used only to confirm you are at least 18."
                />
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={adult}
                    aria-invalid={!!fieldErrors.adult}
                    aria-describedby={fieldErrors.adult ? "adult-error" : undefined}
                    onChange={(e) => setAdult(e.target.checked)}
                  />
                  I am at least 18 and will provide my own identity evidence.
                </label>
                {fieldErrors.adult && (
                  <p id="adult-error" className="text-sm text-destructive">
                    {fieldErrors.adult}
                  </p>
                )}
                {state.profile && (
                  <Notice tone="info">
                    Saving creates a new draft revision. Add your evidence details again; earlier
                    approvals do not apply to the new revision.
                  </Notice>
                )}
                <SubmitButton loading={loading} loadingText="Saving profile…">
                  {state.profile ? "Save revised profile" : "Save profile and continue"}
                </SubmitButton>
                {state.profile && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      apply(state);
                      setEditing(false);
                      setFieldErrors({});
                      setError(undefined);
                    }}
                  >
                    Cancel editing
                  </Button>
                )}
              </form>
            )}
          </section>
          {state.profile ? (
            <>
              <section id="documents" className="onboarding-section space-y-4">
                <h2 className="text-lg font-semibold">2. Private documents</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a separate file for identity and for qualification or teaching experience.
                  After scanning, explain each document in step 3. Uploading alone does not submit
                  your profile.
                </p>
                <div className="rounded-xl bg-muted/40 p-4">
                  <strong className="text-sm">
                    {state.evidence.length} document{state.evidence.length === 1 ? "" : "s"}{" "}
                    uploaded
                  </strong>
                  <p className="text-sm text-muted-foreground">
                    {clean.length} passed scanning. Scan passed means the file can be used for
                    review; it does not mean Trust has approved it.
                  </p>
                </div>
                {policy?.test_only ? (
                  <Notice tone="info">
                    Fictional testing only. Do not upload real identity documents.
                  </Notice>
                ) : policy && !policy.uploads_enabled ? (
                  <Notice tone="info">
                    Document uploads are temporarily unavailable. Your saved documents are listed
                    below.
                  </Notice>
                ) : (
                  <p className="text-sm">
                    PDF, PNG or JPEG · up to 1 MiB each · private. Mask unnecessary identity
                    numbers.
                  </p>
                )}
                <ul aria-label="Uploaded documents" className="space-y-3">
                  {state.evidence.map((item, index) => {
                    const claim = state.claims.find((c) => c.evidence_id === item.id);
                    const locked = claim && ["PENDING", "APPROVED"].includes(claim.status);
                    return (
                      <li key={item.id} className="rounded-xl border p-4">
                        <div className="flex items-start gap-3">
                          <FileText
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 text-muted-foreground"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold">
                              {claim ? claimNames[claim.kind] : label(item)}
                            </h3>
                            {claim && (
                              <p className="text-sm text-muted-foreground">{label(item)}</p>
                            )}
                            <p className="mt-2 text-sm">
                              <strong>Uploaded</strong> · {scanNames[item.scan_status]}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {claim
                                ? `Linked: ${claim.description}`
                                : item.scan_status === "CLEAN"
                                  ? "Next: select this document in step 3 and explain what it proves."
                                  : item.scan_status === "QUARANTINED"
                                    ? "Waiting for scanning. Refresh status to check again."
                                    : "Withdraw this file and upload a replacement."}
                            </p>
                            {claim && (
                              <p className="mt-1 text-sm">Trust review: {reviewLabel(claim)}</p>
                            )}
                            <details className="mt-3 text-xs text-muted-foreground">
                              <summary>Document reference</summary>
                              <p className="mt-1 break-all">{item.id}</p>
                              <p>
                                Original filenames are not retained. Use the document number and
                                evidence description to identify this file.
                              </p>
                            </details>
                            <Button
                              className="mt-3"
                              variant="outline"
                              disabled={loading || !!locked}
                              onClick={() =>
                                void run(async () => {
                                  start();
                                  const r = await api.withdrawTutorEvidence(item.id);
                                  if (r.ok) {
                                    await load();
                                    setNotice("Document withdrawn.");
                                  } else setError(describeFailure(r.error));
                                })
                              }
                            >
                              Withdraw document {index + 1}
                            </Button>
                            {locked && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Start a revised profile before withdrawing evidence under review or
                                approved.
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!state.evidence.length && (
                  <p className="text-sm text-muted-foreground">
                    No documents uploaded yet. Choose your first file below.
                  </p>
                )}
                <label className="block text-sm font-semibold" htmlFor="evidence-upload">
                  Choose a private document
                </label>
                <input
                  ref={uploadInput}
                  id="evidence-upload"
                  aria-label="Evidence file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  disabled={loading || !policy?.uploads_enabled || policy.test_only}
                  onChange={(e) => setFile(e.target.files?.[0])}
                />
                {file && (
                  <p className="text-sm">
                    Selected: {file.name} · {Math.ceil(file.size / 1024)} KB. Click Upload evidence
                    to save it.
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={loading || !file || !policy?.uploads_enabled}
                    onClick={() => void upload()}
                  >
                    {loading ? "Please wait…" : "Upload evidence"}
                  </Button>
                  {policy?.test_only && (
                    <Button disabled={loading} onClick={() => void upload(true)}>
                      Upload fictional sample
                    </Button>
                  )}
                  <Button variant="outline" disabled={loading} onClick={() => void load()}>
                    Refresh document status
                  </Button>
                </div>
              </section>
              <section id="evidence-details" className="onboarding-section space-y-4">
                <h2 className="text-lg font-semibold">3. Explain what your documents prove</h2>
                <p className="text-sm text-muted-foreground">
                  Add one identity entry and at least one subject qualification or experience entry.
                  Each entry needs its own scanned document. These are your evidence claims for
                  Trust review.
                </p>
                <ul className="space-y-2 text-sm">
                  <li>{identity ? "✓ Identity evidence added" : "○ Identity evidence needed"}</li>
                  <li>
                    {teaching
                      ? "✓ Qualification or experience added"
                      : "○ Qualification or experience needed"}
                  </li>
                </ul>
                {draft ? (
                  <form onSubmit={addClaim} className="space-y-4">
                    <label className="block text-sm font-semibold">
                      Claim type
                      <select
                        aria-label="Claim type"
                        className="input mt-2"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as TutorClaim["kind"])}
                      >
                        {Object.entries(claimNames).map(([value, label]) => (
                          <option
                            key={value}
                            value={value}
                            disabled={value === "IDENTITY" && identity}
                          >
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {kind !== "IDENTITY" && (
                      <label className="block text-sm font-semibold">
                        Subject
                        <select
                          required
                          aria-label="Subject"
                          className="input mt-2"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          <option value="">Choose the subject you teach</option>
                          {catalogue?.terms
                            .filter((t) => t.kind === "SUBJECT" && t.active)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <Field
                      label="Claim description"
                      hint={
                        kind === "IDENTITY"
                          ? "Explain how this document confirms your identity and adult status. At least 10 characters."
                          : "Describe the qualification or teaching experience shown in this document. At least 10 characters."
                      }
                      value={description}
                      required
                      minLength={10}
                      maxLength={300}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                    <label className="block text-sm font-semibold">
                      Clean evidence
                      <select
                        required
                        aria-label="Clean evidence"
                        className="input mt-2"
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                      >
                        <option value="">Choose an uploaded document</option>
                        {available.map((item) => (
                          <option key={item.id} value={item.id}>
                            {label(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!available.length && (
                      <p className="text-sm text-muted-foreground">
                        Upload a separate document in step 2, or wait for its scan to pass. Each
                        file can support only one entry.
                      </p>
                    )}
                    <SubmitButton
                      loading={loading}
                      loadingText="Saving evidence details…"
                      disabled={!available.length || (kind === "IDENTITY" && identity)}
                    >
                      Add claim
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-sm">
                    Your submitted evidence details are listed below. Edit your profile to begin a
                    new revision if corrections are needed.
                  </p>
                )}
              </section>
              <section id="review" className="onboarding-section space-y-4">
                <h2 className="text-lg font-semibold">4. Submit and track your review</h2>
                {state.claims.map((claim) => (
                  <article key={claim.id} className="space-y-2 rounded-xl border p-4 text-sm">
                    <h3 className="font-semibold">
                      {claimNames[claim.kind]} · {reviewLabel(claim)}
                    </h3>
                    {claim.subject_id && (
                      <p>
                        Subject:{" "}
                        {catalogue?.terms.find((t) => t.id === claim.subject_id)?.label ??
                          claim.subject_id}
                      </p>
                    )}
                    <p>{claim.description}</p>
                    {claim.reviewed_check && <p>Check: {claim.reviewed_check}</p>}
                    {claim.review_reason && <p>Review reason: {claim.review_reason}</p>}
                    {claim.expires_at && (
                      <p>Approval expires: {new Date(claim.expires_at).toLocaleDateString()}</p>
                    )}
                  </article>
                ))}
                {draft && !ready && (
                  <p className="text-sm">
                    Before submitting: {!identity ? "add identity evidence. " : ""}
                    {!teaching ? "add subject qualification or experience evidence. " : ""}All
                    linked documents must pass scanning.
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={loading || !draft || !ready || editing}
                    onClick={() => void submit()}
                  >
                    {submitted ? "Profile already submitted" : "Submit Tutor profile for review"}
                  </Button>
                  <Button variant="outline" disabled={loading} onClick={() => void load()}>
                    Refresh review status
                  </Button>
                </div>
                {editing && (
                  <p className="text-sm">Save or cancel your profile changes before submitting.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Approval of profile evidence and approval of a teaching offer are separate.
                  Neither is a guarantee of teaching quality.
                </p>
              </section>
              <TutorPhotoEditor />
            </>
          ) : (
            <Notice tone="info">
              Save your profile in step 1 to unlock document uploads and review.
            </Notice>
          )}
        </>
      )}
    </AuthShell>
  );
}
