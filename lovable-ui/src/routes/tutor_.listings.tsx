import { createFileRoute, Link } from "@tanstack/react-router";
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
export const Route = createFileRoute("/tutor_/listings")({
  ssr: false,
  component: TutorListings,
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
        <dt className="font-semibold">Teaching combination</dt>
        <dd>
          {label(offer.subject_id)} · {label(offer.level_id)} · {label(offer.curriculum_id)} ·{" "}
          {label(offer.exam_id)}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Online tuition, paid directly to Tutor</dt>
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
        <dd className="whitespace-pre-wrap">{offer.description}</dd>
      </div>
    </dl>
  );
}
function TutorListings() {
  const [listings, setListings] = useState<TeachingListing[]>([]);
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [offer, setOffer] = useState<TeachingOffer>(initial);
  const [editing, setEditing] = useState<TeachingListing>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [ready, setReady] = useState(false);
  const { loading, run } = useSingleFlight();
  const [eligibleSubjects, setEligibleSubjects] = useState<string[]>([]);
  const [approvalsReady, setApprovalsReady] = useState(false);
  const initialized = useRef(false);
  const unavailableApprovals =
    "Subject approvals could not be loaded. Refresh offers after the server update.";
  const load = async () => {
    const r = await api.listings();
    if (r.ok) {
      setListings(r.data.listings);
      const available = Array.isArray(r.data.eligible_subject_ids);
      setEligibleSubjects(available ? r.data.eligible_subject_ids : []);
      setApprovalsReady(available);
      setReady(true);
      if (!available) setError(unavailableApprovals);
      else setError((current) => (current === unavailableApprovals ? undefined : current));
    } else setError(describeFailure(r.error));
  };
  useEffect(() => {
    void load();
    void api.catalogue().then((r) => {
      if (r.ok) setCatalogue(r.data);
      else setError(describeFailure(r.error));
    });
  }, []);
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
      if (!editing && !eligibleSubjects.includes(offer.subject_id)) {
        setError(
          "Choose a Subject covered by your current identity and Subject evidence approvals.",
        );
        return;
      }
      const r = editing
        ? await api.editListing(editing.id, editing.revision, offer)
        : await api.createListing(offer);
      if (r.ok) {
        setOffer(approvedDraft(catalogue, eligibleSubjects));
        setEditing(undefined);
        setNotice("Draft saved. Submit it for staff review when the details are ready.");
        await load();
      } else {
        setError(describeFailure(r.error));
        if (r.error.kind === "http" && r.error.code === "TUTOR_INELIGIBLE") await load();
      }
    });
  };
  const action = (item: TeachingListing, kind: "SUBMIT" | "PAUSE" | "RESUME") =>
    run(async () => {
      setError(undefined);
      setNotice(undefined);
      const r = await api.listingAction(item.id, item.revision, kind);
      if (r.ok) {
        setNotice(
          kind === "SUBMIT"
            ? "Offer submitted for review."
            : kind === "PAUSE"
              ? "Offer paused."
              : "Offer is available again.",
        );
        await load();
      } else {
        setError(describeFailure(r.error));
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
  return (
    <AuthShell
      wide
      title="Your teaching offers"
      intro="Offer one precise teaching combination per Listing. Current identity and matching Subject evidence approvals are required."
      footer={
        <Link to="/tutor" className="link">
          Back to Tutor onboarding
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}
      {ready && approvalsReady && catalogue && !editing && (
        <Notice tone="info">
          {eligibleSubjects.length ? (
            <>
              Subjects currently approved for new offers:{" "}
              {eligibleSubjects
                .map((id) => catalogue.terms.find((t) => t.id === id)?.label || id)
                .join(", ")}
              . Choose the matching Subject and learning requirements below.
              {!terms("SUBJECT").length && (
                <p className="mt-2">
                  No approved Subject belongs to this Learning Domain. Choose a matching domain or
                  complete another Subject evidence review.
                </p>
              )}
            </>
          ) : (
            <>
              Complete your current identity and at least one Subject evidence review before
              creating an offer.{" "}
              <Link to="/tutor" className="link">
                Check Tutor evidence status
              </Link>
              .
            </>
          )}
        </Notice>
      )}
      <section className="mt-5 space-y-4">
        <h2 className="font-semibold">Saved offers</h2>
        {!ready ? (
          <p role="status">Loading offers…</p>
        ) : !listings.length ? (
          <p>No teaching offers yet. Create your first draft below.</p>
        ) : (
          listings.map((item) => (
            <article key={item.id} className="rounded-xl border bg-background p-5 space-y-4">
              <h3 className="font-semibold">{item.offer.title}</h3>
              <p role="status">
                Status:{" "}
                {
                  {
                    DRAFT: "Draft saved — submit for review",
                    REVIEW: "Waiting for staff review",
                    CHANGES_REQUESTED: "Changes requested — see feedback below",
                    PUBLISHED: "Published",
                    PAUSED: "Paused by you",
                    SAFETY_SUSPENDED: "Restricted by staff",
                  }[item.status]
                }{" "}
                · {item.eligible ? "Available for discovery" : "Currently unavailable"}
              </p>
              <OfferSummary offer={item.offer} catalogue={catalogue} />
              {item.requires_profile_review && (
                <Notice tone="info">
                  Your Tutor profile changed. Complete its evidence review, then save and resubmit
                  this offer.
                </Notice>
              )}
              {item.review_reason && <p>Staff review: {item.review_reason}</p>}
              {item.safety_reason && <p>Safety decision: {item.safety_reason}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    setEditing(item);
                    setOffer(item.offer);
                    setError(undefined);
                    setNotice(undefined);
                  }}
                >
                  Edit offer
                </Button>
                {["DRAFT", "CHANGES_REQUESTED"].includes(item.status) && (
                  <Button
                    disabled={loading || item.requires_profile_review}
                    onClick={() => void action(item, "SUBMIT")}
                  >
                    Submit offer for review
                  </Button>
                )}
                {item.status === "PUBLISHED" && (
                  <Button disabled={loading} onClick={() => void action(item, "PAUSE")}>
                    Pause offer
                  </Button>
                )}
                {item.status === "PAUSED" && (
                  <Button disabled={loading} onClick={() => void action(item, "RESUME")}>
                    Resume offer
                  </Button>
                )}
              </div>
              {item.status === "SAFETY_SUSPENDED" && (
                <p className="text-sm text-muted-foreground">
                  Staff must lift this restriction. Saving edits keeps the suspension in place.
                </p>
              )}
            </article>
          ))
        )}
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh offers
        </Button>
      </section>
      <form onSubmit={save} className="mt-8 space-y-4">
        <h2 className="font-semibold">
          {editing ? "Edit teaching offer" : "Create teaching offer"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Saving edits removes publication approval and starts a new draft. Keep contact details and
          links out of the public text.
        </p>
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
          <span id="offer-description-hint" className="mt-2 block text-sm text-muted-foreground">
            40–1,500 characters. Explain what learners will learn and how you teach.
          </span>
        </label>
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
        {select("Subject", "SUBJECT", "subject_id")}
        {select("Learner Level", "LEVEL", "level_id")}
        {select("Curriculum", "CURRICULUM", "curriculum_id", offer.domain_id !== "school")}
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
            onChange={(e) => change("trial_price_paise", Math.round(Number(e.target.value) * 100))}
          />
        )}
        <p className="text-sm text-muted-foreground">
          Online teaching only. Tuition and any trial fee are paid directly to the Tutor.
        </p>
        <SubmitButton
          loading={loading}
          disabled={!ready || (!editing && !eligibleSubjects.includes(offer.subject_id))}
          loadingText="Saving…"
        >
          {editing ? "Save revised offer" : "Save draft offer"}
        </SubmitButton>
        {editing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(undefined);
              setOffer(approvedDraft(catalogue, eligibleSubjects));
            }}
          >
            Cancel editing
          </Button>
        )}
      </form>
    </AuthShell>
  );
}
