import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  api,
  describeFailure,
  type Catalogue,
  type TutorIntroduction,
  type TutorOnboardingDraft,
  type TutorState,
} from "@/lib/api";
import { Field, Notice } from "./account/ui";
import { Button } from "./ui/button";

const steps = ["Subjects", "About you", "Your rate", "Identity details", "Review"];
const tips = [
  "Start with the subjects you know. Choose up to 10; specific class levels and teaching formats belong to your teaching offers.",
  "Help learners understand your approach, skills and experience. Write in your own words and keep contact details out of your introduction.",
  "Set an indicative hourly tuition rate. Learners arrange tuition payments directly with you; your platform pass is separate.",
  "Your identity document stays private. This marketplace checks identity and adulthood before making a profile visible. Teaching expertise is self-declared unless separately reviewed.",
  "Check your introduction before saving. Saving does not publish it or purchase a pass. Next, submit one private identity document for review.",
];
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
export function TutorIntroductionWizard({
  catalogue,
  onCompleted,
}: {
  catalogue: Catalogue;
  onCompleted: (state: TutorState, notice?: string) => void;
}) {
  const [form, setForm] = useState(initial),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState<TutorOnboardingDraft | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [query, setQuery] = useState("");
  const alive = useRef(true),
    flight = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    setError(undefined);
    setReady(false);
    const r = await api.tutorOnboardingDraft();
    if (!alive.current) return;
    if (r.ok) {
      setDraft(r.data.draft);
      setForm({ ...initial, ...r.data.draft?.data });
      setStep(r.data.draft?.step ?? 0);
      setReady(true);
      if (r.data.draft) setNotice("Your private saved draft is ready to continue.");
    } else setError(describeFailure(r.error));
  }
  const change = <K extends keyof TutorIntroduction>(key: K, value: TutorIntroduction[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setNotice(undefined);
  };
  function validate(at: number) {
    if (at === 0 && !form.subject_ids.length) return "Choose at least one subject.";
    if (at === 1 && (form.display_name.trim().length < 2 || form.biography.trim().length < 40))
      return "Enter your name and at least 40 characters about your teaching.";
    if (
      at === 2 &&
      (!Number.isInteger(form.hourly_rate_paise) ||
        form.hourly_rate_paise < 100 ||
        form.hourly_rate_paise > 10000000)
    )
      return "Enter an hourly rate between ₹1 and ₹100,000.";
    if (at === 3 && !form.adult_confirmed)
      return "Confirm that you are at least 18 and will submit your own identity document.";
    return undefined;
  }
  async function persist(next: number) {
    const { replace_identity: _, expected_public_revision: __, ...data } = form;
    const r = await api.saveTutorOnboardingDraft({
      revision: draft?.revision ?? 0,
      step: next,
      data,
    });
    if (!alive.current) return false;
    if (!r.ok) {
      setError(describeFailure(r.error));
      return false;
    }
    setDraft(r.data.draft);
    setNotice("Private draft saved. Your profile is not published.");
    return true;
  }
  async function action(task: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch {
      if (alive.current) setError("Could not save your changes. Please try again.");
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function next(e: FormEvent) {
    e.preventDefault();
    void action(async () => {
      if (step < 4) {
        const issue = validate(step);
        if (issue) {
          setError(issue);
          return;
        }
        if (await persist(step + 1)) {
          setStep(step + 1);
          heading.current?.focus();
        }
        return;
      }
      for (let i = 0; i < 4; i++) {
        const issue = validate(i);
        if (issue) {
          setStep(i);
          setError(issue);
          return;
        }
      }
      const result = await api.saveTutorIntroduction(form);
      if (!alive.current) return;
      if (!result.ok) {
        setError(describeFailure(result.error));
        return;
      }
      let cleanupNotice: string | undefined;
      if (draft) {
        const cleared = await api.clearTutorOnboardingDraft(draft.revision);
        if (!cleared.ok)
          cleanupNotice =
            "Profile saved. A private working draft was retained because it could not be cleared; your saved profile is unaffected.";
      }
      if (alive.current) onCompleted(result.data, cleanupNotice);
    });
  }
  if (!ready)
    return (
      <div className="space-y-3">
        {error ? (
          <>
            <Notice tone="error">{error}</Notice>
            <Button onClick={() => void load()}>Retry saved draft</Button>
          </>
        ) : (
          <p role="status">Loading your private draft…</p>
        )}
      </div>
    );
  return (
    <div className="space-y-5" aria-busy={busy}>
      <ol aria-label="Introduction steps" className="flex flex-wrap gap-2">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={
              "rounded-full px-3 py-2 text-sm " +
              (step === i ? "bg-amber-100 font-semibold" : "bg-muted text-muted-foreground")
            }
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Introduction progress"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={5}
      >
        <div
          className="h-full bg-amber-300 transition-all"
          style={{ width: `${(step + 1) * 20}%` }}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
        <aside className="rounded-3xl bg-amber-50 p-6">
          <h3 className="font-semibold">Good to know</h3>
          <p className="mt-3 text-sm leading-relaxed">{tips[step]}</p>
          <p className="mt-5 text-xs text-muted-foreground">
            {draft ? `Last saved ${new Date(draft.updated_at).toLocaleString()}` : "Not saved yet"}
          </p>
        </aside>
        <form onSubmit={next} className="min-w-0 space-y-5 rounded-3xl border bg-card p-5 sm:p-7">
          <fieldset disabled={busy} className="space-y-5">
            <h3 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
              {
                [
                  "Which subjects do you teach?",
                  "Tell learners about yourself",
                  "Set your hourly rate",
                  "Your private identity details",
                  "Review your introduction",
                ][step]
              }
            </h3>
            {step === 0 && (
              <fieldset className="space-y-3">
                <legend className="sr-only">Subjects you teach</legend>
                <Field
                  label="Search subjects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try Maths or English"
                />
                <p className="text-sm">
                  {form.subject_ids.length}/10 selected · self-declared expertise
                </p>
                <div className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
                  {catalogue.terms
                    .filter(
                      (t) =>
                        t.kind === "SUBJECT" &&
                        t.active &&
                        t.label.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((t) => (
                      <label
                        key={t.id}
                        className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.subject_ids.includes(t.id)}
                          disabled={
                            busy ||
                            (!form.subject_ids.includes(t.id) && form.subject_ids.length >= 10)
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
              </fieldset>
            )}
            {step === 1 && (
              <>
                <Field
                  label="Your public name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.display_name}
                  onChange={(e) => change("display_name", e.target.value)}
                />
                <label className="block space-y-2 text-sm font-semibold">
                  About you, skills and experience
                  <textarea
                    aria-label="About you, skills and experience"
                    className="input min-h-48 font-normal"
                    required
                    minLength={40}
                    maxLength={1000}
                    value={form.biography}
                    onChange={(e) => change("biography", e.target.value)}
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    {form.biography.length}/1,000 characters · minimum 40 characters under our
                    current profile rules.
                  </span>
                </label>
              </>
            )}
            {step === 2 && (
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
                hint="You can set different lesson rates in your teaching offers later."
              />
            )}
            {step === 3 && (
              <>
                <label className="block space-y-2 text-sm font-semibold">
                  Identity country
                  <select
                    className="input"
                    value={form.identity_country}
                    onChange={(e) => {
                      change("identity_country", e.target.value as "IN" | "OTHER");
                      change("identity_document", e.target.value === "IN" ? "AADHAAR" : "PASSPORT");
                    }}
                  >
                    <option value="IN">India</option>
                    <option value="OTHER">Other country</option>
                  </select>
                </label>
                <label className="block space-y-2 text-sm font-semibold">
                  Identity document
                  <select
                    className="input"
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
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    required
                    checked={form.adult_confirmed}
                    onChange={(e) => change("adult_confirmed", e.target.checked)}
                  />
                  I am at least 18 and will upload my own identity document.
                </label>
                <p className="text-xs text-muted-foreground">
                  Document upload follows profile saving. No diploma is required for this
                  introduction.
                </p>
              </>
            )}
            {step === 4 && (
              <>
                <dl className="space-y-4 break-words text-sm">
                  <div>
                    <dt className="text-muted-foreground">Public name</dt>
                    <dd className="font-semibold">{form.display_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Subjects</dt>
                    <dd>
                      {form.subject_ids
                        .map((id) => catalogue.terms.find((t) => t.id === id)?.label || id)
                        .join(", ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">About you</dt>
                    <dd className="whitespace-pre-wrap">{form.biography}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Hourly rate</dt>
                    <dd>₹{(form.hourly_rate_paise / 100).toLocaleString("en-IN")}/hour</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Private identity document to submit next
                    </dt>
                    <dd>{form.identity_document.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                <Notice tone="info">
                  Your introduction becomes publicly eligible after identity review. Teaching offers
                  require current Tutor Pro and their own approval.
                </Notice>
              </>
            )}
            <div className="flex flex-wrap gap-3">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setStep(step - 1);
                    setError(undefined);
                    heading.current?.focus();
                  }}
                >
                  Go back
                </Button>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : step === 4 ? "Save profile and continue" : "Next"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await persist(step);
                  })
                }
              >
                Save private draft
              </Button>
            </div>
            <Link to="/tutor/dashboard" className="link inline-block text-sm">
              Back to Tutor dashboard
            </Link>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
