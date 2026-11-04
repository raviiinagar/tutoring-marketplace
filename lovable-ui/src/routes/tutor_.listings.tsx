import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  describeFailure,
  type Catalogue,
  type CatalogueKind,
  type TeachingOffer,
  type TeachingListing,
} from "@/lib/api";
import { AuthShell, Field, Notice, SubmitButton, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { accountSessionKey } from "@/lib/session";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import {
  canResumeOffer,
  canSubmitOffer,
  offerAvailability,
  offerStatusLabels,
} from "@/lib/tutor-workspace";
export const Route = createFileRoute("/tutor_/listings")({
  ssr: false,
  component: TutorListingsPage,
  head: () => ({
    meta: [
      { title: "Teaching offers — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
const initial: TeachingOffer = {
  title: "",
  description: "",
  domain_id: "school",
  subject_id: "subject-physics",
  level_id: "level-class-10",
  curriculum_id: "curriculum-cbse",
  language_ids: ["language-english"],
  currency: "INR",
  teaching_mode: "ONLINE",
  rate_paise: 50000,
  rate_unit: "HOUR",
  trial_kind: "NONE",
};
function approvedDraft(catalogue: Catalogue | undefined, subjects: string[]): TeachingOffer {
  const subject =
    catalogue?.terms.find(
      (t) => t.kind === "SUBJECT" && t.id === initial.subject_id && subjects.includes(t.id),
    ) || catalogue?.terms.find((t) => t.kind === "SUBJECT" && subjects.includes(t.id));
  if (!catalogue || !subject) return { ...initial, subject_id: "" };
  const domain = subject.domain_ids.includes(initial.domain_id)
    ? initial.domain_id
    : subject.domain_ids[0];
  if (!domain) return { ...initial, subject_id: "" };
  const supports = (id: string) =>
    catalogue.terms.some((t) => t.id === id && t.domain_ids.includes(domain));
  return {
    ...initial,
    domain_id: domain,
    subject_id: subject.id,
    level_id: supports(initial.level_id)
      ? initial.level_id
      : catalogue.terms.find((t) => t.kind === "LEVEL" && t.domain_ids.includes(domain))?.id || "",
    curriculum_id:
      domain === "school" && initial.curriculum_id && supports(initial.curriculum_id)
        ? initial.curriculum_id
        : undefined,
    language_ids: supports("language-english") ? ["language-english"] : [],
  };
}
export function OfferSummary({
  offer,
  catalogue,
}: {
  offer: TeachingOffer;
  catalogue: Catalogue | undefined;
}) {
  const label = (id?: string) =>
    id ? catalogue?.terms.find((t) => t.id === id)?.label || id : "Not applicable";
  return (
    <dl className="space-y-2 text-sm">
      <div>
        <dt className="font-semibold">Class mode</dt>
        <dd>{offer.teaching_mode === "IN_PERSON" ? "In person" : "Online"}</dd>
      </div>
      {offer.class_location && (
        <div>
          <dt className="font-semibold">Public class location</dt>
          <dd>
            {[offer.class_location.area, offer.class_location.city, offer.class_location.country]
              .filter(Boolean)
              .join(", ")}
          </dd>
        </div>
      )}
      <div>
        <dt className="font-semibold">Teaching combination</dt>
        <dd>
          {[offer.subject_id, offer.level_id, offer.curriculum_id, offer.exam_id]
            .filter((id): id is string => !!id)
            .map(label)
            .join(" · ")}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Tuition, paid directly to Tutor</dt>
        <dd>
          ₹{(offer.rate_paise / 100).toFixed(2)} / {offer.rate_unit.toLowerCase()}
          {offer.lesson_minutes ? ` (${offer.lesson_minutes} minutes)` : ""}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Teaching languages</dt>
        <dd>{offer.language_ids.map(label).join(", ")}</dd>
      </div>
      <div>
        <dt className="font-semibold">Trial</dt>
        <dd>
          {offer.trial_kind === "NONE"
            ? "No trial"
            : `${offer.trial_kind === "FREE" ? "Free" : `₹${((offer.trial_price_paise || 0) / 100).toFixed(2)}`} · ${offer.trial_minutes} minutes`}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Offer description</dt>
        <dd className="whitespace-pre-wrap break-words">{offer.description}</dd>
      </div>
    </dl>
  );
}
function TutorListingsPage() {
  const account = useTutorAccount(),
    navigate = useNavigate();
  useEffect(() => {
    if (account.anonymous) void navigate({ to: "/auth/signin", replace: true });
  }, [account.anonymous, navigate]);
  if (!account.user)
    return (
      <AuthShell title="Teaching offers">
        {account.error ? (
          <>
            <Notice tone="error">{account.error}</Notice>
            <Button onClick={() => void account.session.refetch()}>Try again</Button>
          </>
        ) : (
          <p role="status">Checking your account…</p>
        )}
      </AuthShell>
    );
  if (!account.user.roles.includes("TUTOR"))
    return (
      <AuthShell title="Start teaching">
        <p>Enable the Tutor role before managing teaching offers.</p>
        <Link to="/account/settings" hash="roles" className="link mt-4 inline-block">
          Choose your account roles
        </Link>
      </AuthShell>
    );
  return <TutorListingsManager key={account.user.id} />;
}
export function TutorListingsManager() {
  const queryClient = useQueryClient();
  const expired = (failure: { kind: string; status?: number }) => {
    if (failure.kind === "http" && failure.status === 401) {
      queryClient.setQueryData(accountSessionKey, {
        ok: false,
        error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Please sign in." },
      });
      return true;
    }
    return false;
  };
  const [listings, setListings] = useState<TeachingListing[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [offer, setOffer] = useState<TeachingOffer>(initial);
  const [editing, setEditing] = useState<TeachingListing>();
  const [error, setError] = useState<string>();
  const [catalogueError, setCatalogueError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [ready, setReady] = useState(false);
  const { loading, run } = useSingleFlight();
  const [eligibleSubjects, setEligibleSubjects] = useState<string[]>([]);
  const [proActive, setProActive] = useState(false);
  const [approvalsReady, setApprovalsReady] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false),
    [step, setStep] = useState(0),
    [filter, setFilter] = useState<TeachingListing["status"] | "ALL">("ALL");
  const editorHeading = useRef<HTMLHeadingElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    loadVersion = useRef(0);
  const initialized = useRef(false);
  const unavailableApprovals =
    "Available subjects could not be confirmed. Refresh offers before creating or submitting.";
  const load = async () => {
    const version = ++loadVersion.current;
    if (!alive.current) return;
    setReady(false);
    const r = await api.listings();
    if (!alive.current || version !== loadVersion.current) return;
    if (r.ok) {
      setListings(r.data.listings);
      setProActive(r.data.tutor_pro_active === true);
      const available = Array.isArray(r.data.eligible_subject_ids);
      setEligibleSubjects(available ? r.data.eligible_subject_ids : []);
      setApprovalsReady(available);
      setReady(true);
      if (!available) setError(unavailableApprovals);
      else setError((current) => (current === unavailableApprovals ? undefined : current));
    } else {
      setApprovalsReady(false);
      setProActive(false);
      setError(describeFailure(r.error));
      expired(r.error);
    }
  };
  const loadCatalogue = async () => {
    const result = await api.catalogue();
    if (!alive.current) return;
    if (result.ok) {
      setCatalogue(result.data);
      setCatalogueError(undefined);
    } else setCatalogueError(describeFailure(result.error));
  };
  useEffect(() => {
    alive.current = true;
    void load();
    void loadCatalogue();
    return () => {
      alive.current = false;
      loadVersion.current++;
    };
  }, []);
  useEffect(() => {
    if (editorOpen) editorHeading.current?.focus();
  }, [editorOpen, step]);
  useEffect(() => {
    if (error || notice || catalogueError) feedback.current?.focus();
  }, [error, notice, catalogueError]);
  useEffect(() => {
    if (ready && approvalsReady && catalogue && !editing && !initialized.current) {
      initialized.current = true;
      const preferred = approvedDraft(catalogue, eligibleSubjects);
      setOffer((current) =>
        current.domain_id === initial.domain_id && current.subject_id === initial.subject_id
          ? {
              ...current,
              domain_id: preferred.domain_id,
              subject_id: preferred.subject_id,
              level_id:
                current.level_id === initial.level_id ? preferred.level_id : current.level_id,
              curriculum_id:
                current.curriculum_id === initial.curriculum_id
                  ? preferred.curriculum_id
                  : current.curriculum_id,
              language_ids:
                current.language_ids.length === 1 &&
                current.language_ids[0] === initial.language_ids[0]
                  ? preferred.language_ids
                  : current.language_ids,
            }
          : current,
      );
    }
  }, [ready, approvalsReady, catalogue, editing, eligibleSubjects]);
  const change = <K extends keyof TeachingOffer>(key: K, value: TeachingOffer[K]) =>
    setOffer((current) => ({ ...current, [key]: value }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(undefined);
      setNotice(undefined);
      if (!proActive || !approvalsReady || !ready) {
        setError("Refresh your offer access before saving. An active Tutor Pro pass is required.");
        return;
      }
      if (!editing && !eligibleSubjects.includes(offer.subject_id)) {
        setError("Choose a subject currently available to your Tutor profile.");
        return;
      }
      const r = editing
        ? await api.editListing(editing.id, editing.revision, offer)
        : await api.createListing(offer);
      if (!alive.current) return;
      if (r.ok) {
        setListings((rows) => [
          r.data.listing,
          ...rows.filter((row) => row.id !== r.data.listing.id),
        ]);
        setOffer(approvedDraft(catalogue, eligibleSubjects));
        setEditing(undefined);
        setEditorOpen(false);
        setStep(0);
        setNotice(
          r.data.listing.status === "SAFETY_SUSPENDED"
            ? "Changes saved. The staff restriction remains in place."
            : "Draft saved. Submit it for staff review when the details are ready.",
        );
        await load();
      } else {
        setError(describeFailure(r.error));
        if (expired(r.error)) return;
        if (r.error.kind === "http" && r.error.code === "TUTOR_INELIGIBLE") await load();
      }
    });
  };
  const action = (item: TeachingListing, kind: "SUBMIT" | "PAUSE" | "RESUME") =>
    run(async () => {
      setError(undefined);
      setNotice(undefined);
      const r = await api.listingAction(item.id, item.revision, kind);
      if (!alive.current) return;
      if (r.ok) {
        setListings((rows) => rows.map((row) => (row.id === item.id ? r.data.listing : row)));
        setNotice(
          kind === "SUBMIT"
            ? "Offer submitted for review."
            : kind === "PAUSE"
              ? "Offer paused."
              : "Offer resumed. Check its current discovery status below.",
        );
        await load();
      } else {
        setError(describeFailure(r.error));
        if (expired(r.error)) return;
        await load();
      }
    });
  const terms = (kind: CatalogueKind) =>
    catalogue?.terms.filter(
      (t) =>
        t.kind === kind &&
        t.domain_ids.includes(offer.domain_id) &&
        (kind !== "SUBJECT" || editing || eligibleSubjects.includes(t.id)),
    ) || [];
  const select = (
    label: string,
    kind: CatalogueKind,
    key: "subject_id" | "level_id" | "curriculum_id" | "exam_id",
    optional = false,
  ) => (
    <label className="block">
      {label}
      <select
        aria-label={label}
        className="input mt-2"
        value={offer[key] || ""}
        onChange={(e) => change(key, e.target.value || undefined)}
        required={!optional}
      >
        <option value="">{optional ? "Not applicable" : "Choose " + label}</option>
        {terms(kind).map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
  const canCreate =
    ready && approvalsReady && !!catalogue && proActive && eligibleSubjects.length > 0;
  const visible = listings.filter((item) => filter === "ALL" || item.status === filter);
  const beginCreate = () => {
    setEditing(undefined);
    setOffer(approvedDraft(catalogue, eligibleSubjects));
    setStep(0);
    setEditorOpen(true);
    setError(undefined);
    setNotice(undefined);
  };
  const beginEdit = (item: TeachingListing) => {
    setEditing(item);
    setOffer({ ...item.offer, class_location: item.class_location ?? item.offer.class_location });
    setStep(0);
    setEditorOpen(true);
    setError(undefined);
    setNotice(undefined);
  };
  const editorSubmit = (event: FormEvent) => {
    if (step < 3) {
      event.preventDefault();
      if (step === 0 && (offer.language_ids.length < 1 || offer.language_ids.length > 3)) {
        setError("Choose between one and three teaching languages.");
        return;
      }
      setError(undefined);
      setStep((value) => value + 1);
    } else save(event);
  };
  return (
    <AuthShell
      wide
      title="Your teaching offers"
      intro="Describe each class clearly, save a private draft and submit it for staff review."
      footer={
        <Link to="/tutor/dashboard" className="link">
          Back to Tutor dashboard
        </Link>
      }
    >
      <div ref={feedback} tabIndex={-1} className="space-y-3 outline-none">
        {catalogueError && (
          <div className="space-y-3">
            <Notice tone="error">Subject options could not be loaded.</Notice>
            <Button variant="outline" onClick={() => void loadCatalogue()}>
              Retry subject options
            </Button>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}
      </div>
      <div className="mb-6 mt-5 flex flex-wrap gap-3">
        <Button
          className="rounded-full"
          disabled={loading || editorOpen || !canCreate}
          onClick={beginCreate}
        >
          Create teaching offer
        </Button>
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh offers
        </Button>
      </div>
      {ready && !proActive && (
        <div className="mb-5">
          <Notice tone="info">
            An active Tutor Pro pass is required to create or publish teaching offers. Your
            identity-reviewed introduction stays free.{" "}
            <Link to="/tutor" hash="tutor-pro" className="link">
              View Tutor Pro options
            </Link>
          </Notice>
        </div>
      )}
      {ready && approvalsReady && catalogue && (
        <p className="mb-5 text-sm text-muted-foreground">
          {eligibleSubjects.length
            ? `Subjects available for new offers: ${eligibleSubjects.map((id) => catalogue.terms.find((term) => term.id === id)?.label || id).join(", ")}.`
            : "Complete your profile and current identity/review requirements before creating an offer."}{" "}
          <Link to="/tutor" className="link">
            Check profile & identity
          </Link>
        </p>
      )}
      <section aria-labelledby="saved-offers-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="saved-offers-title" className="text-xl font-semibold">
            Saved offers
          </h2>
          <label className="text-sm font-medium">
            Filter offers
            <select
              aria-label="Filter teaching offers"
              className="input mt-2"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="ALL">All offers</option>
              {Object.entries(offerStatusLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!ready ? (
          <p role="status">
            {error
              ? "Offers could not be loaded. Refresh to try again."
              : "Loading your teaching offers…"}
          </p>
        ) : !listings.length ? (
          <div className="rounded-2xl bg-amber-50 p-5">
            <h3 className="font-semibold">Your first teaching offer starts with a subject</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              When your profile and Tutor Pro access are ready, choose a subject, describe your
              class and review the tuition before saving.
            </p>
          </div>
        ) : !visible.length ? (
          <p className="rounded-2xl border p-5 text-sm">No offers match this filter.</p>
        ) : (
          visible.map((item) => (
            <article
              key={item.id}
              aria-label={item.offer.title}
              className="space-y-4 rounded-2xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="min-w-0 break-words text-lg font-semibold">{item.offer.title}</h3>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold">
                  {offerStatusLabels[item.status]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{offerAvailability(item)}</p>
              <p className="text-sm font-semibold">
                ₹{(item.offer.rate_paise / 100).toLocaleString("en-IN")} /{" "}
                {item.offer.rate_unit === "HOUR"
                  ? "hour"
                  : `lesson (${item.offer.lesson_minutes} min)`}{" "}
                · {item.offer.teaching_mode === "ONLINE" ? "Online" : "In person"}
              </p>
              {item.review_reason && (
                <Notice tone="info">Review feedback: {item.review_reason}</Notice>
              )}
              {item.safety_reason && (
                <Notice tone="info">Safety decision: {item.safety_reason}</Notice>
              )}
              <details className="rounded-xl bg-secondary p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Offer details & trial terms
                </summary>
                <div className="mt-4">
                  <OfferSummary
                    offer={{
                      ...item.offer,
                      class_location: item.class_location ?? item.offer.class_location,
                    }}
                    catalogue={catalogue}
                  />
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={loading || editorOpen || !proActive || !approvalsReady || !catalogue}
                  onClick={() => beginEdit(item)}
                >
                  Edit offer
                </Button>
                {(item.status === "DRAFT" || item.status === "CHANGES_REQUESTED") && (
                  <Button
                    disabled={
                      loading || editorOpen || !canSubmitOffer(item, proActive, eligibleSubjects)
                    }
                    onClick={() => void action(item, "SUBMIT")}
                  >
                    Submit offer for review
                  </Button>
                )}
                {item.status === "PUBLISHED" && (
                  <Button
                    variant="outline"
                    disabled={loading || editorOpen}
                    onClick={() => void action(item, "PAUSE")}
                  >
                    Pause offer
                  </Button>
                )}
                {item.status === "PAUSED" && (
                  <Button
                    variant="outline"
                    disabled={
                      loading || editorOpen || !canResumeOffer(item, proActive, eligibleSubjects)
                    }
                    onClick={() => void action(item, "RESUME")}
                  >
                    Resume offer
                  </Button>
                )}
                {item.status === "PUBLISHED" && item.eligible && (
                  <Button variant="outline" asChild>
                    <Link
                      to="/tutors/$listingId"
                      params={{ listingId: item.id }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View public offer
                    </Link>
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
      {editorOpen && (
        <section
          className="mt-8 rounded-3xl border bg-card p-5 sm:p-7"
          aria-label="Teaching offer editor"
        >
          <h2 ref={editorHeading} tabIndex={-1} className="text-xl font-semibold outline-none">
            {editing ? "Edit teaching offer" : "Create teaching offer"}
          </h2>
          <ol aria-label="Offer editing progress" className="my-5 flex flex-wrap gap-3 text-sm">
            {["Subject & format", "About the class", "Rates & trial", "Review & save"].map(
              (label, index) => (
                <li
                  key={label}
                  aria-current={step === index ? "step" : undefined}
                  className={
                    step === index ? "font-semibold text-primary" : "text-muted-foreground"
                  }
                >
                  {index + 1}. {label}
                </li>
              ),
            )}
          </ol>
          <form onSubmit={editorSubmit} className="space-y-5">
            <fieldset
              disabled={loading || !proActive || !approvalsReady || !ready}
              className="space-y-5"
            >
              {step === 0 && (
                <div className="space-y-5">
                  {" "}
                  <label className="block">
                    Learning Domain
                    <select
                      aria-label="Learning Domain"
                      className="input mt-2"
                      value={offer.domain_id}
                      onChange={(e) =>
                        setOffer((v) => ({
                          ...v,
                          domain_id: e.target.value,
                          subject_id: "",
                          level_id: "",
                          curriculum_id: undefined,
                          exam_id: undefined,
                        }))
                      }
                    >
                      {catalogue?.domains.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Class mode
                    <select
                      className="input mt-2"
                      value={offer.teaching_mode}
                      onChange={(e) =>
                        change("teaching_mode", e.target.value as TeachingOffer["teaching_mode"])
                      }
                    >
                      <option value="ONLINE">Online</option>
                      <option value="IN_PERSON">In person</option>
                    </select>
                  </label>
                  {select("Subject", "SUBJECT", "subject_id")}
                  {select("Learner Level", "LEVEL", "level_id")}
                  {select(
                    "Curriculum",
                    "CURRICULUM",
                    "curriculum_id",
                    offer.domain_id !== "school",
                  )}
                  {select("Exam Track", "EXAM", "exam_id", offer.domain_id !== "entrance")}
                  <fieldset className="space-y-2">
                    <legend className="font-medium">Teaching languages (choose 1–3)</legend>
                    {terms("LANGUAGE").map((t) => (
                      <label key={t.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={offer.language_ids.includes(t.id)}
                          onChange={(e) =>
                            change(
                              "language_ids",
                              e.target.checked
                                ? [...offer.language_ids, t.id]
                                : offer.language_ids.filter((id) => id !== t.id),
                            )
                          }
                        />
                        {t.label}
                      </label>
                    ))}
                  </fieldset>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-5">
                  {" "}
                  <Field
                    label="Offer title"
                    hint="Describe your subject and learner level. 10–100 characters."
                    required
                    minLength={10}
                    value={offer.title}
                    maxLength={100}
                    onChange={(e) => change("title", e.target.value)}
                  />
                  <label className="block">
                    Offer description
                    <textarea
                      aria-label="Offer description"
                      className="input mt-2 min-h-28"
                      value={offer.description}
                      maxLength={1500}
                      minLength={40}
                      aria-describedby="offer-description-hint"
                      onChange={(e) => change("description", e.target.value)}
                      required
                    />
                    <span
                      id="offer-description-hint"
                      className="mt-2 block text-sm text-muted-foreground"
                    >
                      40–1,500 characters. Explain what learners will learn and how you teach.
                    </span>
                  </label>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-5">
                  {" "}
                  <Field
                    label="Tuition rate (INR)"
                    type="number"
                    min={1}
                    max={100000}
                    step="0.01"
                    value={offer.rate_paise / 100}
                    onChange={(e) => change("rate_paise", Math.round(Number(e.target.value) * 100))}
                  />
                  <label className="block">
                    Rate unit
                    <select
                      aria-label="Rate unit"
                      className="input mt-2"
                      value={offer.rate_unit}
                      onChange={(e) =>
                        setOffer((v) => ({
                          ...v,
                          rate_unit: e.target.value as "HOUR" | "LESSON",
                          lesson_minutes: e.target.value === "LESSON" ? 60 : undefined,
                        }))
                      }
                    >
                      <option value="HOUR">Per hour</option>
                      <option value="LESSON">Per lesson</option>
                    </select>
                  </label>
                  {offer.rate_unit === "LESSON" && (
                    <Field
                      label="Lesson duration (minutes)"
                      type="number"
                      min={30}
                      max={180}
                      value={offer.lesson_minutes || 60}
                      onChange={(e) => change("lesson_minutes", Number(e.target.value))}
                    />
                  )}
                  <label className="block">
                    Trial type
                    <select
                      aria-label="Trial type"
                      className="input mt-2"
                      value={offer.trial_kind}
                      onChange={(e) =>
                        setOffer((v) => ({
                          ...v,
                          trial_kind: e.target.value as TeachingOffer["trial_kind"],
                          trial_minutes: e.target.value === "NONE" ? undefined : 30,
                          trial_price_paise: e.target.value === "PAID" ? 10000 : undefined,
                        }))
                      }
                    >
                      <option value="NONE">No trial</option>
                      <option value="FREE">Free trial</option>
                      <option value="PAID">Paid trial</option>
                    </select>
                  </label>
                  {offer.trial_kind !== "NONE" && (
                    <Field
                      label="Trial duration (minutes)"
                      type="number"
                      min={15}
                      max={90}
                      value={offer.trial_minutes || 30}
                      onChange={(e) => change("trial_minutes", Number(e.target.value))}
                    />
                  )}
                  {offer.trial_kind === "PAID" && (
                    <Field
                      label="Trial price (INR)"
                      type="number"
                      min={1}
                      max={100000}
                      step="0.01"
                      value={(offer.trial_price_paise || 100) / 100}
                      onChange={(e) =>
                        change("trial_price_paise", Math.round(Number(e.target.value) * 100))
                      }
                    />
                  )}
                  <p className="text-sm text-muted-foreground">
                    Tuition and trial fees are paid directly to you. In-person offers use the public
                    city saved in your Tutor profile.
                  </p>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-4">
                  <h3 className="font-semibold">Review your teaching offer</h3>
                  <p className="break-words text-lg font-semibold">{offer.title}</p>
                  <OfferSummary offer={offer} catalogue={catalogue} />
                  <Notice tone="info">
                    {editing?.status === "PUBLISHED"
                      ? "Saving changes removes the current publication approval and creates a draft for a new review."
                      : "Saving creates a private draft. Submitting for staff review is a separate action."}{" "}
                    Keep contact details and links out of public offer text. Staff restrictions
                    remain until staff lift them.
                  </Notice>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {step > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep((value) => value - 1)}
                  >
                    Back
                  </Button>
                )}
                {step < 3 ? (
                  <Button type="submit">Continue</Button>
                ) : (
                  <SubmitButton
                    loading={loading}
                    disabled={!ready || (!editing && !eligibleSubjects.includes(offer.subject_id))}
                    loadingText="Saving…"
                  >
                    {editing ? "Save revised offer" : "Save draft offer"}
                  </SubmitButton>
                )}
              </div>
            </fieldset>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                setEditorOpen(false);
                setEditing(undefined);
                setStep(0);
                setOffer(approvedDraft(catalogue, eligibleSubjects));
                setError(undefined);
              }}
            >
              Cancel editing
            </Button>
          </form>
        </section>
      )}
    </AuthShell>
  );
}
