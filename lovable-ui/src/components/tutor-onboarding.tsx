import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, FileCheck, ShieldCheck } from "lucide-react";
import {
  api,
  describeFailure,
  type TutorState,
  type TutorPolicy,
  type Catalogue,
  type TutorIntroduction,
} from "@/lib/api";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "./account/ui";
import { Button } from "./ui/button";
import { TutorPhotoEditor } from "./tutor-photo-editor";
import { TutorPro } from "./tutor-pro";
const initial: TutorIntroduction = {
  display_name: "",
  biography: "",
  subject_ids: [],
  hourly_rate_paise: 50000,
  identity_country: "IN",
  identity_document: "AADHAAR",
  adult_confirmed: false,
  public_email_consent: false,
  replace_identity: false,
};
export function TutorOnboarding() {
  const [state, setState] = useState<TutorState>(),
    [policy, setPolicy] = useState<TutorPolicy>(),
    [catalogue, setCatalogue] = useState<Catalogue>(),
    [form, setForm] = useState(initial),
    [file, setFile] = useState<File>(),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [errors, setErrors] = useState<Record<string, string[]>>({}),
    [editing, setEditing] = useState(true);
  const { loading, run } = useSingleFlight();
  const input = useRef<HTMLInputElement>(null);
  const apply = (next: TutorState) => {
    setState(next);
    const p = next.profile;
    if (p) {
      setForm({
        display_name: p.display_name,
        biography: p.biography,
        subject_ids: p.subject_ids || [],
        hourly_rate_paise: p.hourly_rate_paise || 50000,
        identity_country: p.identity_country || "IN",
        identity_document: p.identity_document || "AADHAAR",
        adult_confirmed: true,
        public_email_consent: !!p.public_email_consent,
        replace_identity: false,
        expected_public_revision: p.public_revision,
      });
      setEditing(p.onboarding_version !== 2);
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
  const change = <K extends keyof TutorIntroduction>(k: K, v: TutorIntroduction[K]) =>
    setForm((p) => ({ ...p, [k]: v }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      setErrors({});
      const r = await api.saveTutorIntroduction(form);
      if (r.ok) {
        apply(r.data);
        setNotice(
          "Profile saved. " +
            (r.data.profile?.eligible
              ? "Your public profile is updated."
              : "Next: upload one identity document."),
        );
      } else {
        setError(describeFailure(r.error));
        setErrors(("field_errors" in r.error ? r.error.field_errors : undefined) || {});
      }
    });
  };
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
  const approved = !!p?.eligible && !!p.hourly_rate_paise && !!p.subject_ids?.length;
  return (
    <AuthShell
      wide
      title="Your Tutor profile"
      intro="Introduce yourself, upload one ID, and track approval here. Your profile is free after identity review."
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!state ? (
        <p role="status">Loading your profile…</p>
      ) : (
        <div className="space-y-6">
          <ol aria-label="Profile progress" className="grid gap-3 sm:grid-cols-3">
            {[
              ["Profile saved", !!p],
              ["ID submitted", !!identity],
              ["Profile public", approved],
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
          <section className="onboarding-section space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">1. About you</h2>
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
                {approved && p.public_id && (
                  <Button variant="outline" asChild>
                    <Link to="/profiles/$profileId" params={{ profileId: p.public_id }}>
                      View your public profile
                    </Link>
                  </Button>
                )}
              </>
            ) : (
              <form onSubmit={save} className="space-y-5">
                <Field
                  label="Your public name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.display_name}
                  error={errors["display_name"]?.join(" ")}
                  onChange={(e) => change("display_name", e.target.value)}
                />
                <fieldset>
                  <legend className="text-sm font-semibold">Subjects you teach</legend>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select up to 10. No qualification document required.
                  </p>
                  <div className="mt-3 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
                    {catalogue?.terms
                      .filter((t) => t.kind === "SUBJECT" && t.active)
                      .map((t) => (
                        <label className="flex gap-2 rounded-lg border p-3 text-sm" key={t.id}>
                          <input
                            type="checkbox"
                            checked={form.subject_ids.includes(t.id)}
                            disabled={
                              !form.subject_ids.includes(t.id) && form.subject_ids.length >= 10
                            }
                            onChange={(e) =>
                              change(
                                "subject_ids",
                                e.target.checked
                                  ? [...form.subject_ids, t.id]
                                  : form.subject_ids.filter((id) => id !== t.id),
                              )
                            }
                          />
                          {t.label}
                        </label>
                      ))}
                  </div>
                  {errors["subject_ids"] && (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      Choose at least one Subject.
                    </p>
                  )}
                </fieldset>
                <Field
                  label="Hourly tuition rate (INR)"
                  type="number"
                  required
                  min={1}
                  max={100000}
                  step="0.01"
                  value={form.hourly_rate_paise / 100}
                  onChange={(e) =>
                    change("hourly_rate_paise", Math.round(Number(e.target.value) * 100))
                  }
                  error={errors["hourly_rate_paise"]?.join(" ")}
                  hint="An indicative rate for your profile. Tuition is paid directly to you."
                />
                <label className="block space-y-2 text-sm font-semibold">
                  About you, skills and experience
                  <textarea
                    className="input min-h-32 font-normal"
                    required
                    minLength={40}
                    maxLength={1000}
                    value={form.biography}
                    onChange={(e) => change("biography", e.target.value)}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    {form.biography.length}/1,000 characters · minimum 40. Keep phone numbers,
                    emails and links out.
                  </span>
                  {errors["biography"] && (
                    <span className="text-destructive">{errors["biography"].join(" ")}</span>
                  )}
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Identity country
                    <select
                      className="input mt-2"
                      value={form.identity_country}
                      onChange={(e) => {
                        change("identity_country", e.target.value as "IN" | "OTHER");
                        change(
                          "identity_document",
                          e.target.value === "IN" ? "AADHAAR" : "PASSPORT",
                        );
                      }}
                    >
                      <option value="IN">India</option>
                      <option value="OTHER">Other country</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Identity document
                    <select
                      className="input mt-2"
                      value={form.identity_document}
                      onChange={(e) =>
                        change(
                          "identity_document",
                          e.target.value as TutorIntroduction["identity_document"],
                        )
                      }
                    >
                      {form.identity_country === "IN" && (
                        <>
                          <option value="AADHAAR">Aadhaar</option>
                          <option value="GOVERNMENT_ID">Other government photo ID</option>
                        </>
                      )}
                      <option value="PASSPORT">Passport</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    required
                    checked={form.adult_confirmed}
                    onChange={(e) => change("adult_confirmed", e.target.checked)}
                  />
                  I am at least 18 and will upload my own identity document.
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.public_email_consent}
                    onChange={(e) => change("public_email_consent", e.target.checked)}
                  />
                  <span>
                    Show my verified email publicly to everyone when my Tutor Pro pass is active and
                    a teaching offer is published. I can withdraw this consent here.
                  </span>
                </label>
                {p && (
                  <>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={form.replace_identity}
                        onChange={(e) => change("replace_identity", e.target.checked)}
                      />
                      Replace my identity document and start a new review.
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Changing your identity name, country or document type also starts a new
                      review. About, Subject, rate and contact-consent edits retain your current
                      identity approval.
                    </p>
                  </>
                )}
                <SubmitButton loading={loading} disabled={!catalogue} loadingText="Saving…">
                  {p ? "Save profile changes" : "Save profile and continue"}
                </SubmitButton>
                {p && (
                  <Button type="button" variant="outline" onClick={() => apply(state)}>
                    Cancel editing
                  </Button>
                )}
              </form>
            )}
          </section>
          {p && (
            <>
              <section className="onboarding-section space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <FileCheck aria-hidden className="size-5" />
                  2. One private identity document
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
                      <Notice tone="info">Fictional testing only. Do not upload a real ID.</Notice>
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
                    Identity approved. Your profile can appear publicly without a pass or teaching
                    offer.
                  </Notice>
                )}
              </section>
              <details className="onboarding-section">
                <summary className="cursor-pointer font-semibold">
                  Public profile photo · optional
                </summary>
                <p className="my-3 text-sm text-muted-foreground">
                  You can add your own portrait later. It is reviewed separately.
                </p>
                <TutorPhotoEditor />
              </details>
              <TutorPro identityApproved={approved} />
            </>
          )}
        </div>
      )}
    </AuthShell>
  );
}
