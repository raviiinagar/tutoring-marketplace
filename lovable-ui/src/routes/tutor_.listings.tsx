import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  describeFailure,
  type Catalogue,
  type CatalogueKind,
  type TeachingOffer,
  type TeachingListing,
  type TutorProfile,
  type TutorPhoto,
  type TutorPresence,
} from "@/lib/api";
import { AuthShell, Field, Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { accountSessionKey } from "@/lib/session";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import { TutorAdManager } from "@/components/tutor-ad-manager";
import { hasPublicationPhoto } from "@/lib/tutor-workspace";
import { TutorPhotoEditor } from "@/components/tutor-photo-editor";
import { introductionFromProfile } from "@/components/tutor-introduction-wizard";
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
  // Like Superprof, a new ad starts with a free first class of one hour; the
  // Tutor can switch it off on the "Adjust your fees" step.
  trial_kind: "FREE",
  trial_minutes: 60,
};
// The ad wizard follows Superprof's order. Superprof's phone step is not here
// yet (we do not send SMS); publishing stays an explicit choice on Review.
const adSteps = [
  "Subjects",
  "Title of your ad",
  "About the class",
  "About you",
  "Location of the class",
  "Languages",
  "Hourly fee",
  "Adjust your fees",
  "Profile picture",
  "Review & publish",
] as const;
const REVIEW = adSteps.length - 1;
const stepQuestions = [
  "Which subject do you teach?",
  "Title of your ad",
  "About the class",
  "About you",
  "Location of the class",
  "Languages you teach in",
  "Hourly fee",
  "Adjust your fees",
  "Profile picture",
  "Check your ad before publishing",
] as const;
const goodToKnow: Record<number, string> = {
  0: "Choose the subject, level and curriculum learners search for. Create another ad for each further subject.",
  1: "A clear title helps learners find you. Use at least 12 words: your subject, how you teach and who you teach.",
  2: "Describe your methods, how a class runs and who it suits. Around 40 words or more works well. Keep contact details and links out of your text.",
  3: "Tell learners about your experience and what makes your teaching work. This text is shared by all your ads. Keep contact details and links out of it.",
  4: "Only your city and area appear publicly, never a house address.",
  5: "Choose up to three languages you teach in.",
  6: "You are free to choose your fee and to change it at any time. Tuition is paid directly to you.",
  7: "A free first class helps learners decide. You can switch it off.",
  8: "Your photo is shared by all your ads. You need one to publish; you can still save a draft without it.",
};
const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
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
        <p className="text-muted-foreground">
          You have not started a teaching introduction yet. Nothing is published while you work on
          it, and you keep using the same account to learn.
        </p>
        <Link to="/tutor" className="link mt-5 inline-block">
          Start your teaching introduction
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
  const [directMode, setDirectMode] = useState(false);
  const [profile, setProfile] = useState<TutorProfile>();
  const [photo, setPhoto] = useState<TutorPhoto | null>(null);
  const [presence, setPresence] = useState<TutorPresence>();
  const [biography, setBiography] = useState("");
  const [place, setPlace] = useState({ city: "", area: "" });
  // A photo is needed to put an ad online, never to keep a private draft.
  // This mirrors requirePublicationPhoto on the server, which stays authoritative.
  const canPublishPhoto = hasPublicationPhoto(photo);
  const [approvalsReady, setApprovalsReady] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false),
    [step, setStep] = useState(0);
  const editorHeading = useRef<HTMLHeadingElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    loadVersion = useRef(0);
  const initialized = useRef(false);
  const unavailableApprovals =
    "Ad publishing is temporarily unavailable. Refresh your ads to confirm the current publication rules.";
  const load = async () => {
    const version = ++loadVersion.current;
    if (!alive.current) return;
    setReady(false);
    const r = await api.listings();
    if (!alive.current || version !== loadVersion.current) return;
    if (r.ok) {
      setListings(r.data.listings);
      setDirectMode(r.data.publication_policy === "direct-ads-v1");
      const available =
        Array.isArray(r.data.eligible_subject_ids) && r.data.publication_policy === "direct-ads-v1";
      setEligibleSubjects(available ? r.data.eligible_subject_ids : []);
      setApprovalsReady(available);
      setReady(true);
      if (!available) setError(unavailableApprovals);
      else setError((current) => (current === unavailableApprovals ? undefined : current));
    } else {
      setApprovalsReady(false);
      setDirectMode(false);
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
    void Promise.all([api.tutor(), api.tutorPhoto(), api.tutorPresence()]).then(
      ([p, image, where]) => {
        if (!alive.current) return;
        if (p.ok) {
          setProfile(p.data.profile ?? undefined);
          setBiography(p.data.profile?.biography ?? "");
        }
        if (image.ok) setPhoto(image.data.photo);
        if (where.ok) {
          setPresence(where.data.presence);
          setPlace({
            city: where.data.presence.location?.city ?? "",
            area: where.data.presence.location?.area ?? "",
          });
        }
      },
    );
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
      // "Save changes" on an earlier step still checks and saves that step first.
      if (step < REVIEW && !(await leaveStep())) return;
      if (!directMode || !approvalsReady || !ready) {
        setError("Refresh your ads before saving. Direct publication must be available.");
        return;
      }
      if (!editing && !eligibleSubjects.includes(offer.subject_id)) {
        setError("Choose a subject currently available to your Tutor profile.");
        return;
      }
      const shouldPublish =
        (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
      const r = editing
        ? await api.editListing(editing.id, editing.revision, offer)
        : await api.createListing(offer);
      if (!alive.current) return;
      if (r.ok) {
        let saved = r.data.listing;
        if (shouldPublish && saved.status !== "PUBLISHED") {
          const publication = await api.listingAction(saved.id, saved.revision, "PUBLISH");
          if (!alive.current) return;
          if (publication.ok) saved = publication.data.listing;
          else
            setError(
              "Your draft was saved, but could not go online. " +
                describeFailure(publication.error),
            );
        }
        setListings((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
        setOffer(approvedDraft(catalogue, eligibleSubjects));
        setEditing(undefined);
        setEditorOpen(false);
        setStep(0);
        setNotice(
          saved.status === "SAFETY_SUSPENDED"
            ? "Changes saved. The staff restriction remains in place."
            : saved.status === "PUBLISHED" && saved.eligible
              ? "Your ad is online now. Changes are visible to students."
              : saved.status === "PUBLISHED"
                ? "Changes saved. Your ad is currently unavailable; check your teaching preferences."
                : "Your ad is saved as a private draft.",
        );
        await load();
      } else {
        setError(describeFailure(r.error));
        if (expired(r.error)) return;
        if (r.error.kind === "http" && r.error.code === "TUTOR_INELIGIBLE") await load();
      }
    });
  };
  const action = (item: TeachingListing, kind: "PUBLISH" | "PAUSE" | "RESUME" | "ARCHIVE") =>
    run(async () => {
      setError(undefined);
      setNotice(undefined);
      const r = await api.listingAction(item.id, item.revision, kind);
      if (!alive.current) return;
      if (r.ok) {
        setListings((rows) => rows.map((row) => (row.id === item.id ? r.data.listing : row)));
        setNotice(
          kind === "ARCHIVE"
            ? "Your advert has been deleted from public search and My ads."
            : kind === "PAUSE"
              ? "Your ad is offline."
              : r.data.listing.eligible
                ? "Your ad is online now."
                : "Your ad was saved but is not currently available. Check your teaching preferences and any restrictions.",
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
    ready && directMode && approvalsReady && !!catalogue && eligibleSubjects.length > 0;
  const beginCreate = () => {
    setEditing(undefined);
    setOffer(approvedDraft(catalogue, eligibleSubjects));
    setStep(0);
    setEditorOpen(true);
    setError(undefined);
    setNotice(undefined);
  };
  const beginEdit = (item: TeachingListing, targetStep = 0) => {
    setEditing(item);
    setOffer({ ...item.offer, class_location: item.class_location ?? item.offer.class_location });
    setStep(targetStep);
    setEditorOpen(true);
    setError(undefined);
    setNotice(undefined);
  };
  // Saves what a step owns outside the ad (biography, public place) and checks
  // the step, then moves on. Returns false to stay on the step.
  const leaveStep = async (): Promise<boolean> => {
    if (step === 1 && wordCount(offer.title) < 12) {
      setError("Write at least 12 words in your ad title.");
      return false;
    }
    if (step === 2 && !offer.description.trim()) {
      setError("Write something about your class.");
      return false;
    }
    if (step === 3 && profile && biography.trim() !== profile.biography.trim()) {
      const r = await api.saveTutorIntroduction({
        ...introductionFromProfile(profile),
        biography: biography.trim(),
      });
      if (!alive.current) return false;
      if (!r.ok) {
        setError(describeFailure(r.error));
        expired(r.error);
        return false;
      }
      if (r.data.profile) setProfile(r.data.profile);
    }
    if (step === 4) {
      if (!place.city.trim()) {
        setError("Add the city where you teach. Only your city and area appear publicly.");
        return false;
      }
      if (!presence) {
        setError("Your teaching location could not be loaded. Refresh the page and try again.");
        return false;
      }
      const modes = presence.teaching_modes.includes(offer.teaching_mode)
        ? presence.teaching_modes
        : [...presence.teaching_modes, offer.teaching_mode];
      const changed =
        modes.length !== presence.teaching_modes.length ||
        place.city.trim() !== (presence.location?.city ?? "") ||
        place.area.trim() !== (presence.location?.area ?? "");
      if (changed) {
        const r = await api.saveTutorPresence({
          expected_revision: presence.revision,
          location: {
            city: place.city.trim(),
            country: presence.location?.country || "India",
            ...(place.area.trim() ? { area: place.area.trim() } : {}),
            ...(presence.location?.state ? { state: presence.location.state } : {}),
          },
          teaching_modes: modes,
          accepting_students: presence.accepting_students ?? true,
          weekly_slots: presence.weekly_slots,
          timezone: presence.timezone,
        });
        if (!alive.current) return false;
        if (!r.ok) {
          setError(describeFailure(r.error));
          expired(r.error);
          return false;
        }
        setPresence(r.data.presence);
      }
    }
    if (step === 5 && (offer.language_ids.length < 1 || offer.language_ids.length > 3)) {
      setError("Choose between one and three teaching languages.");
      return false;
    }
    if (step === 8) {
      const image = await api.tutorPhoto();
      if (alive.current && image.ok) setPhoto(image.data.photo);
    }
    return true;
  };
  const editorSubmit = (event: FormEvent) => {
    const saveNow =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-save-now") === "true";
    if (step < REVIEW && !saveNow) {
      event.preventDefault();
      void run(async () => {
        setError(undefined);
        if (await leaveStep()) setStep((value) => value + 1);
      });
    } else save(event);
  };
  return (
    <AuthShell
      dashboard
      title="My ads"
      intro="Create your teaching ad for free. Publish when you are ready and update it whenever you like."
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
      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Identity verification is optional. Your ad goes online after you publish it.
        </p>
        <Button variant="outline" disabled={loading} onClick={() => void load()}>
          Refresh ads
        </Button>
      </div>
      {!ready ? (
        <p role="status">
          {error ? "Your ads could not be loaded. Refresh to try again." : "Loading your ads…"}
        </p>
      ) : (
        <TutorAdManager
          ads={listings}
          catalogue={catalogue}
          profile={profile}
          photo={photo}
          subjects={eligibleSubjects}
          disabled={loading || editorOpen || !directMode || !approvalsReady}
          canCreate={canCreate}
          onCreate={beginCreate}
          onEdit={beginEdit}
          onAction={(item, kind) => void action(item, kind)}
        />
      )}
      {ready && approvalsReady && !eligibleSubjects.length && (
        <p className="mt-5 text-sm text-muted-foreground">
          Complete your teaching introduction and adult declaration before creating an ad.{" "}
          <Link className="link" to="/tutor">
            Open your profile
          </Link>
        </p>
      )}
      {editorOpen && (
        <section
          className="mt-8 rounded-3xl border bg-card p-5 sm:p-7"
          aria-label="Teaching offer editor"
        >
          <h2 ref={editorHeading} tabIndex={-1} className="text-xl font-semibold outline-none">
            {editing ? "Edit teaching offer" : "Create teaching offer"}
          </h2>
          <ol aria-label="Offer editing progress" className="sr-only">
            {adSteps.map((label, index) => (
              <li key={label} aria-current={step === index ? "step" : undefined}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground" aria-hidden="true">
            Step {step + 1} of {adSteps.length}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${((step + 1) / adSteps.length) * 100}%` }}
            />
          </div>
          <form onSubmit={editorSubmit} className="mt-5 space-y-5">
            <fieldset
              disabled={loading || !directMode || !approvalsReady || !ready}
              className="space-y-5"
            >
              <div className="ad-wizard-step">
                {step < REVIEW && (
                  <aside className="ad-wizard-tip" aria-label="Good to know">
                    <p className="font-semibold">Good to know</p>
                    <p className="mt-2 text-sm text-muted-foreground">{goodToKnow[step]}</p>
                  </aside>
                )}
                <div className="min-w-0 flex-1 space-y-5">
                  <h3 className="text-lg font-semibold">{stepQuestions[step]}</h3>
                  {step === 0 && (
                    <div className="space-y-5">
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
                      {select(
                        "Curriculum",
                        "CURRICULUM",
                        "curriculum_id",
                        offer.domain_id !== "school",
                      )}
                      {select("Exam Track", "EXAM", "exam_id", offer.domain_id !== "entrance")}
                    </div>
                  )}
                  {step === 1 && (
                    <Field
                      label="Ad title"
                      hint={`${wordCount(offer.title)}/12 words. Describe your subject, how you teach and the learner level.`}
                      required
                      value={offer.title}
                      maxLength={160}
                      onChange={(e) => change("title", e.target.value)}
                    />
                  )}
                  {step === 2 && (
                    <label className="block">
                      About the class
                      <textarea
                        aria-label="About the class"
                        className="input mt-2 min-h-40"
                        value={offer.description}
                        maxLength={1500}
                        aria-describedby="offer-description-hint"
                        onChange={(e) => change("description", e.target.value)}
                        required
                      />
                      <span
                        id="offer-description-hint"
                        className="mt-2 block text-sm text-muted-foreground"
                      >
                        {wordCount(offer.description)} words · around 40 or more is a good length.
                        Methods, how a class runs and who it suits.
                      </span>
                    </label>
                  )}
                  {step === 3 &&
                    (profile ? (
                      <label className="block">
                        About you
                        <textarea
                          aria-label="About you"
                          className="input mt-2 min-h-40"
                          value={biography}
                          maxLength={1000}
                          aria-describedby="offer-about-you-hint"
                          onChange={(e) => setBiography(e.target.value)}
                        />
                        <span
                          id="offer-about-you-hint"
                          className="mt-2 block text-sm text-muted-foreground"
                        >
                          {wordCount(biography)} words · around 40 or more is a good length. This is
                          shared by all your ads.
                        </span>
                      </label>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Your introduction could not be loaded. You can continue and edit it later
                        from your Tutor profile.
                      </p>
                    ))}
                  {step === 4 && (
                    <div className="space-y-5">
                      <fieldset className="grid gap-3 sm:grid-cols-2">
                        <legend className="mb-2 font-medium">
                          Where do your classes take place?
                        </legend>
                        {(
                          [
                            ["ONLINE", "Online", "Classes by video call"],
                            ["IN_PERSON", "In person", "At your place or the learner's"],
                          ] as const
                        ).map(([mode, label, help]) => (
                          <label
                            key={mode}
                            className={`ad-wizard-choice${offer.teaching_mode === mode ? " ad-wizard-choice-on" : ""}`}
                          >
                            <input
                              type="radio"
                              name="teaching_mode"
                              value={mode}
                              checked={offer.teaching_mode === mode}
                              onChange={() => change("teaching_mode", mode)}
                            />
                            <span>
                              <span className="block font-semibold">{label}</span>
                              <span className="block text-sm text-muted-foreground">{help}</span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <Field
                        label="Your city"
                        required
                        value={place.city}
                        maxLength={80}
                        hint="Mention your city. Your address never appears on the site."
                        onChange={(e) => setPlace((v) => ({ ...v, city: e.target.value }))}
                      />
                      <Field
                        label="Area / locality (optional)"
                        value={place.area}
                        maxLength={80}
                        onChange={(e) => setPlace((v) => ({ ...v, area: e.target.value }))}
                      />
                    </div>
                  )}
                  {step === 5 && (
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
                  )}
                  {step === 6 && (
                    <div className="space-y-5">
                      <Field
                        label="Tuition rate (INR)"
                        type="number"
                        min={1}
                        max={100000}
                        step="0.01"
                        value={offer.rate_paise / 100}
                        onChange={(e) =>
                          change("rate_paise", Math.round(Number(e.target.value) * 100))
                        }
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
                    </div>
                  )}
                  {step === 7 && (
                    <div className="space-y-5">
                      <label className="ad-wizard-choice">
                        <input
                          type="checkbox"
                          checked={offer.trial_kind === "FREE"}
                          onChange={(e) =>
                            setOffer((v) => ({
                              ...v,
                              trial_kind: e.target.checked ? "FREE" : "NONE",
                              trial_minutes: e.target.checked ? 60 : undefined,
                              trial_price_paise: undefined,
                            }))
                          }
                        />
                        <span>
                          <span className="block font-semibold">
                            Offer your first class for free
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            One free class so a learner can try your teaching.
                          </span>
                        </span>
                      </label>
                      {offer.trial_kind === "FREE" && (
                        <Field
                          label="Free class duration (minutes)"
                          type="number"
                          min={15}
                          max={90}
                          value={offer.trial_minutes || 60}
                          onChange={(e) => change("trial_minutes", Number(e.target.value))}
                        />
                      )}
                      {offer.trial_kind !== "FREE" && (
                        <label className="ad-wizard-choice">
                          <input
                            type="checkbox"
                            checked={offer.trial_kind === "PAID"}
                            onChange={(e) =>
                              setOffer((v) => ({
                                ...v,
                                trial_kind: e.target.checked ? "PAID" : "NONE",
                                trial_minutes: e.target.checked ? 30 : undefined,
                                trial_price_paise: e.target.checked ? 10000 : undefined,
                              }))
                            }
                          />
                          <span>
                            <span className="block font-semibold">Offer a paid trial class</span>
                            <span className="block text-sm text-muted-foreground">
                              A shorter first class at a price you choose.
                            </span>
                          </span>
                        </label>
                      )}
                      {offer.trial_kind === "PAID" && (
                        <>
                          <Field
                            label="Trial duration (minutes)"
                            type="number"
                            min={15}
                            max={90}
                            value={offer.trial_minutes || 30}
                            onChange={(e) => change("trial_minutes", Number(e.target.value))}
                          />
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
                        </>
                      )}
                    </div>
                  )}
                  {step === 8 && <TutorPhotoEditor />}
                  {step === REVIEW && (
                    <div className="space-y-4">
                      <p className="break-words text-lg font-semibold">{offer.title}</p>
                      <OfferSummary offer={offer} catalogue={catalogue} />
                      <Notice tone="info">
                        {editing?.status === "PUBLISHED"
                          ? "Saving changes updates your online ad immediately."
                          : "Choose Publish my ad to go online now, or save a private draft for later."}{" "}
                        Keep contact details and links out of public offer text. Staff restrictions
                        remain until staff lift them.
                      </Notice>
                      {editing?.status !== "PUBLISHED" && !canPublishPhoto && (
                        <Notice tone="info">
                          Add a profile photo before you can publish this ad. You can still save it
                          as a private draft now and publish once your photo is in place. Go back to
                          the Profile picture step to add one. Adding a photo never publishes an ad
                          on its own.
                        </Notice>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
                {editing && step < REVIEW && (
                  <Button
                    type="submit"
                    name="intent"
                    value={editing.status === "PUBLISHED" ? "publish" : "draft"}
                    data-save-now="true"
                    variant="outline"
                  >
                    Save changes
                  </Button>
                )}
                {step < REVIEW ? (
                  <Button type="submit">Continue</Button>
                ) : (
                  <Button
                    type="submit"
                    name="intent"
                    value="publish"
                    disabled={
                      !ready ||
                      (!editing && !eligibleSubjects.includes(offer.subject_id)) ||
                      (editing?.status !== "PUBLISHED" && !canPublishPhoto)
                    }
                  >
                    {editing?.status === "PUBLISHED" ? "Save changes" : "Publish my ad"}
                  </Button>
                )}
                {step === REVIEW && editing?.status !== "PUBLISHED" && (
                  <Button
                    type="submit"
                    name="intent"
                    value="draft"
                    variant="outline"
                    disabled={loading}
                  >
                    Save as draft
                  </Button>
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
