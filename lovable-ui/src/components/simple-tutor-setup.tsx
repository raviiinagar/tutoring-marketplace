import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  describeFailure,
  type ApiResult,
  type Catalogue,
  type CatalogueKind,
  type TeachingListing,
  type TeachingOffer,
  type TutorIntroduction,
  type TutorOnboardingDraft,
  type TutorOnboardingDraftData,
  type TutorPhoto,
  type TutorProfile,
} from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
import { hasPublicationPhoto } from "@/lib/tutor-workspace";
import { introductionFromProfile } from "./tutor-introduction-wizard";
import { Field, Notice } from "./account/ui";
import { Button } from "./ui/button";

type Setup = NonNullable<TutorOnboardingDraftData["quick_setup"]>;
type Form = TutorIntroduction & { quick_setup: Setup };
const empty: Form = {
  display_name: "",
  biography: "",
  subject_ids: [],
  hourly_rate_paise: 0,
  identity_country: "IN",
  identity_document: "AADHAAR",
  adult_confirmed: false,
  public_email_consent: false,
  replace_identity: false,
  quick_setup: {
    domain_id: "",
    level_id: "",
    language_id: "",
    teaching_mode: "ONLINE",
    city: "",
    country: "India",
    title: "",
  },
};
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
function value<T>(r: ApiResult<T>): T {
  if (!r.ok) throw new Error(describeFailure(r.error));
  return r.data;
}
const notStarted = <T,>(r: ApiResult<T>) =>
  !r.ok &&
  r.error.kind === "http" &&
  ["TUTOR_ROLE_REQUIRED", "PROFILE_REQUIRED"].includes(r.error.code || "");

/** First ad only: profile, presence and ad remain separate server records.
 * Draft/preview/photo actions never call a publication endpoint. */
export function SimpleTutorSetup({
  catalogue,
  profile,
}: {
  catalogue: Catalogue;
  profile?: TutorProfile | null | undefined;
}) {
  const client = useQueryClient();
  const [form, setForm] = useState<Form>(empty),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [published, setPublished] = useState(false);
  const [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [photo, setPhoto] = useState<TutorPhoto | null>(null),
    [file, setFile] = useState<File>(),
    [photoConsent, setPhotoConsent] = useState(false);
  const draft = useRef<TutorOnboardingDraft | null>(null),
    savedProfile = useRef(profile),
    listing = useRef<TeachingListing | undefined>(undefined),
    pendingSave = useRef(Promise.resolve()),
    dirty = useRef(false),
    flight = useRef(false),
    alive = useRef(true);
  const initialSource = useRef({ catalogue, profile });
  const heading = useRef<HTMLHeadingElement>(null),
    latest = useRef(form);
  function activeValue<T>(result: ApiResult<T>): T {
    if (!alive.current) throw new Error("This setup is no longer open.");
    return value(result);
  }
  const terms = (kind: CatalogueKind, domain = form.quick_setup.domain_id) =>
    catalogue.terms.filter(
      (t) => t.active && t.kind === kind && (!domain || t.domain_ids.includes(domain)),
    );
  const label = (id: string) => catalogue.terms.find((t) => t.id === id)?.label || "";
  const title = (f: Form) =>
    f.quick_setup.title ||
    `${label(f.subject_ids[0] || "").slice(0, 40)} lessons for ${label(f.quick_setup.level_id).slice(0, 32)} students, available ${f.quick_setup.teaching_mode === "ONLINE" ? "online" : "in person"}. Read about my teaching below.`;
  const offer = (f: Form): TeachingOffer => ({
    title: title(f),
    description: f.biography,
    subject_id: f.subject_ids[0] || "",
    domain_id: f.quick_setup.domain_id,
    level_id: f.quick_setup.level_id,
    ...(f.quick_setup.curriculum_id ? { curriculum_id: f.quick_setup.curriculum_id } : {}),
    ...(f.quick_setup.exam_id ? { exam_id: f.quick_setup.exam_id } : {}),
    language_ids: [f.quick_setup.language_id],
    currency: "INR",
    rate_paise: f.hourly_rate_paise,
    rate_unit: "HOUR",
    teaching_mode: f.quick_setup.teaching_mode,
    trial_kind: "NONE",
  });
  const change = (next: Form) => {
    dirty.current = true;
    latest.current = next;
    setForm(next);
    setPreview(false);
    setNotice(undefined);
  };
  const field = <K extends keyof TutorIntroduction>(key: K, v: TutorIntroduction[K]) =>
    change({ ...form, [key]: v });
  const setup = (part: Partial<Setup>) =>
    change({ ...form, quick_setup: { ...form.quick_setup, ...part } });

  useEffect(() => {
    let cancelled = false;
    // Parent/session refreshes can return new object identities while the
    // Tutor is typing. Seed once; never replace a working form with them.
    const { catalogue, profile } = initialSource.current;
    alive.current = true;
    void (async () => {
      try {
        const [d, me, photos, places, ads] = await Promise.all([
          api.tutorOnboardingDraft(),
          api.me(),
          api.tutorPhoto(),
          api.tutorPresence(),
          api.listings(),
        ]);
        const working = value(d).draft;
        for (const r of [photos, places, ads])
          if (!r.ok && !notStarted(r)) throw new Error(describeFailure(r.error));
        if (cancelled || !alive.current) return;
        draft.current = working;
        const existing = ads.ok ? ads.data.listings : [];
        // Never choose an arbitrary existing ad to edit. Only resume this
        // working copy's recorded ad; ownership/revisions remain server checked.
        listing.current = existing.find((a) => a.id === working?.data.quick_setup?.listing_id);
        if (working?.data.quick_setup?.listing_id && !listing.current)
          throw new Error("This ad is no longer available. Open My ads before continuing.");
        if (listing.current && listing.current.status !== "DRAFT") {
          throw new Error(
            "This ad is no longer a private draft. Open My ads to manage its current state.",
          );
        }
        const seeded = profile
          ? introductionFromProfile(profile)
          : { ...empty, display_name: me.ok ? me.data.user.display_name : "" };
        const next: Form = {
          ...seeded,
          ...working?.data,
          quick_setup: {
            ...empty.quick_setup,
            existing_listing_ids: existing.map((a) => a.id),
            ...working?.data.quick_setup,
          },
        };
        // A legacy introduction draft is still resumed, without discarding any
        // existing subjects, identity settings, consent or public revision.
        const subject = catalogue.terms.find((t) => t.id === next.subject_ids[0] && t.active);
        if (!next.quick_setup.domain_id && subject?.domain_ids.length === 1)
          next.quick_setup.domain_id = subject.domain_ids[0]!;
        latest.current = next;
        setForm(next);
        setPhoto(photos.ok ? photos.data.photo : null);
        setReady(true);
        if (working) setNotice("Your saved draft is ready to continue.");
      } catch (e) {
        if (!cancelled && alive.current)
          setError(e instanceof Error ? e.message : "Could not load your saved setup.");
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, []);

  const persist = useCallback(async (f: Form) => {
    const { replace_identity: _, expected_public_revision: __, ...data } = f;
    const r = value(
      await api.saveTutorOnboardingDraft({ revision: draft.current?.revision ?? 0, step: 0, data }),
    );
    if (!alive.current) throw new Error("This setup is no longer open.");
    draft.current = r.draft;
    if (alive.current) setNotice("Draft saved privately.");
  }, []);
  useEffect(() => {
    if (!ready || busy || !dirty.current || published) return;
    const timer = setTimeout(() => {
      const snapshot = latest.current;
      pendingSave.current = pendingSave.current.then(async () => {
        if (!alive.current) return;
        try {
          await persist(snapshot);
        } catch (e) {
          if (alive.current)
            setError(e instanceof Error ? e.message : "Could not save your draft.");
        }
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [form, ready, busy, published, persist]);

  function validate() {
    if (
      !form.subject_ids.length ||
      !form.quick_setup.domain_id ||
      !form.quick_setup.level_id ||
      !form.quick_setup.language_id
    )
      return "Choose your subject, students and teaching language.";
    if (form.quick_setup.domain_id === "school" && !form.quick_setup.curriculum_id)
      return "Choose the school board you teach.";
    if (form.quick_setup.domain_id === "entrance" && !form.quick_setup.exam_id)
      return "Choose the entrance exam you teach.";
    if (form.display_name.trim().length < 2 || !form.biography.trim())
      return "Add your name and a short introduction.";
    if (
      !Number.isInteger(form.hourly_rate_paise) ||
      form.hourly_rate_paise < 100 ||
      form.hourly_rate_paise > 10000000
    )
      return "Enter an hourly rate between ₹1 and ₹100,000.";
    if (
      form.quick_setup.teaching_mode === "IN_PERSON" &&
      (!form.quick_setup.city.trim() || !form.quick_setup.country.trim())
    )
      return "Add your city and country for in-person classes.";
    if (!form.adult_confirmed)
      return "Confirm that you are at least 18 and provide your own teaching services.";
    if (wordCount(title(form)) < 12 || title(form).length > 160)
      return "Use 12 or more words in an ad title of at most 160 characters.";
    if (
      file &&
      (!photoConsent || file.size > 1048576 || !["image/png", "image/jpeg"].includes(file.type))
    )
      return "Choose your own JPEG or PNG up to 1 MiB and confirm photo consent.";
    return undefined;
  }

  async function prepare() {
    await persist(latest.current);
    const { quick_setup: _, ...introduction } = latest.current;
    const next = activeValue(
      await api.saveTutorIntroduction({
        ...introduction,
        ...(savedProfile.current
          ? { expected_public_revision: savedProfile.current.public_revision }
          : {}),
      }),
    );
    savedProfile.current = next.profile;
    const p = activeValue(await api.tutorPresence()).presence;
    const mode = form.quick_setup.teaching_mode;
    activeValue(
      await api.saveTutorPresence({
        expected_revision: p.revision,
        location:
          mode === "IN_PERSON"
            ? { city: form.quick_setup.city.trim(), country: form.quick_setup.country.trim() }
            : p.location,
        teaching_modes: [...new Set([...p.teaching_modes, mode])],
        accepting_students: p.accepting_students ?? true,
        weekly_slots: p.weekly_slots,
        timezone: "Asia/Kolkata",
      }),
    );
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      const uploaded = activeValue(await api.uploadTutorPhoto(file.type, btoa(binary))).photo;
      setPhoto(uploaded);
      setFile(undefined);
      setPhotoConsent(false);
      await client.invalidateQueries({ queryKey: ["account-photo"] });
    } else {
      setPhoto(activeValue(await api.tutorPhoto()).photo);
    }
    const wanted = offer(form);
    const current = activeValue(await api.listings()).listings;
    const matches = (a: TeachingListing) =>
      a.status === "DRAFT" &&
      Object.entries(wanted).every(
        ([k, v]) => JSON.stringify(a.offer[k as keyof TeachingOffer]) === JSON.stringify(v),
      );
    // Recover a successful create whose response was lost, instead of creating
    // another ad on retry. Never adopt a pre-existing unrelated draft.
    const owned =
      current.find((a) => a.id === latest.current.quick_setup.listing_id) ||
      current.find(
        (a) => !latest.current.quick_setup.existing_listing_ids?.includes(a.id) && matches(a),
      );
    if (owned && owned.status !== "DRAFT")
      throw new Error("This ad changed in another session. Open My ads before continuing.");
    listing.current = owned
      ? activeValue(await api.editListing(owned.id, owned.revision, wanted)).listing
      : activeValue(await api.createListing(wanted)).listing;
    const updated = {
      ...latest.current,
      quick_setup: { ...latest.current.quick_setup, listing_id: listing.current.id },
    };
    latest.current = updated;
    setForm(updated);
    dirty.current = false;
    await persist(updated);
    await client.invalidateQueries({ queryKey: accountSessionKey });
    return next;
  }

  async function action(kind: "preview" | "save" | "publish") {
    if (flight.current) return;
    const issue = validate();
    if (issue && kind !== "save") {
      setError(issue);
      heading.current?.focus();
      return;
    }
    flight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await pendingSave.current;
      if (kind === "save" && issue) {
        await persist(latest.current);
        setNotice(
          file
            ? "Draft saved privately. Finish the form to upload your selected photo."
            : "Draft saved privately. Finish the remaining fields when you return.",
        );
        return;
      }
      if (kind === "publish") {
        if (!preview || !listing.current || !hasPublicationPhoto(photo))
          throw new Error("Preview your ad and add a usable profile photo before publishing.");
        const result = activeValue(
          await api.listingAction(listing.current.id, listing.current.revision, "PUBLISH"),
        );
        listing.current = result.listing;
        setPublished(true);
        dirty.current = false;
        // Publication has already succeeded. A cleanup failure must never
        // invite a second publication or claim that the ad is still a draft.
        if (draft.current) {
          const cleared = await api.clearTutorOnboardingDraft(draft.current.revision);
          if (!cleared.ok) setNotice("Your ad is online. A private working copy remains saved.");
        }
        await client.invalidateQueries({ queryKey: ["tutor-dashboard"] });
      } else {
        await prepare();
        setPreview(kind === "preview");
        setNotice(
          kind === "preview"
            ? "Check your ad below. It is still private."
            : "Your profile and ad are saved privately. Nothing has been published.",
        );
      }
      heading.current?.focus();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Could not save your setup. Try again.");
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const select = (
    kind: CatalogueKind,
    text: string,
    selected: string,
    onChange: (s: string) => void,
    all = false,
  ) => (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {text}
      <select
        className="min-h-11 min-w-0 w-full rounded-xl border border-input bg-background px-3 py-2 text-base"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
      >
        <option value="">Choose…</option>
        {terms(kind, all ? "" : undefined).map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
  if (!ready)
    return (
      <div>
        {error ? (
          <Notice tone="error">{error} Refresh this page to retry.</Notice>
        ) : (
          <p role="status">Loading your teaching setup…</p>
        )}
      </div>
    );
  if (published)
    return (
      <section className="space-y-4 rounded-2xl border p-6">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
          {listing.current?.eligible ? "Your ad is online" : "Your ad is published"}
        </h2>
        <p>
          {listing.current?.eligible
            ? "Students can find your ad and send enquiries."
            : "Your ad is currently unavailable for enquiries. Check your availability and restrictions in My ads."}{" "}
          Identity verification is optional.
        </p>
        {photo?.status === "PENDING" && !photo.self_published && (
          <p>Your photo will appear after approval. Your ad can receive enquiries meanwhile.</p>
        )}
        {notice && <p>{notice}</p>}
        <Button asChild>
          <Link to="/tutor/listings">Manage my ad</Link>
        </Button>
      </section>
    );
  return (
    <section className="mx-auto max-w-3xl space-y-5" aria-busy={busy}>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
        {preview ? "Preview your ad" : "Start teaching"}
      </h2>
      <p className="text-sm text-muted-foreground">
        One form, one free ad. Your progress is saved privately. Identity verification is optional.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {preview ? (
        <div className="space-y-4 rounded-2xl border bg-card p-5 sm:p-7">
          {photo && (
            <img
              src={api.photoPreviewUrl(photo.id)}
              alt="Your profile photo preview"
              className="aspect-[4/5] w-28 rounded-xl object-cover"
            />
          )}
          <p className="font-semibold">{form.display_name}</p>
          <h3 className="break-words text-xl font-semibold">{title(form)}</h3>
          <p className="text-sm">
            {label(form.subject_ids[0] || "")} · {label(form.quick_setup.level_id)} ·{" "}
            {label(form.quick_setup.language_id)} ·{" "}
            {form.quick_setup.teaching_mode === "ONLINE"
              ? "Online"
              : `${form.quick_setup.city}, ${form.quick_setup.country}`}
          </p>
          <p className="whitespace-pre-wrap break-words">{form.biography}</p>
          <p className="font-semibold">₹{form.hourly_rate_paise / 100}/hour</p>
          {!hasPublicationPhoto(photo) && (
            <Notice tone="info">
              Add a profile photo before publishing. You can save your draft without one.
            </Notice>
          )}
          {photo?.status === "PENDING" && !photo.self_published && (
            <p className="text-sm">
              Your photo is awaiting approval. A clean photo can allow publication; it stays hidden
              until approved.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Your tuition is paid directly to you. No free trial is included. You can change these
            details later.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !hasPublicationPhoto(photo)}
              onClick={() => void action("publish")}
            >
              {busy ? "Publishing…" : "Publish for free"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPreview(false);
                heading.current?.focus();
              }}
            >
              Edit details
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-6 rounded-2xl border bg-card p-5 sm:p-7"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void action("preview");
          }}
        >
          <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend className="mb-4 font-semibold">What do you teach?</legend>
            {select(
              "SUBJECT",
              "Subject",
              form.subject_ids[0] || "",
              (id) => {
                const domains = catalogue.terms.find((t) => t.id === id)?.domain_ids || [];
                change({
                  ...form,
                  subject_ids: [id, ...(profile?.subject_ids || []).filter((s) => s !== id)].filter(
                    Boolean,
                  ),
                  quick_setup: {
                    ...form.quick_setup,
                    domain_id: domains.length === 1 ? domains[0]! : "",
                    level_id: "",
                    curriculum_id: "",
                    exam_id: "",
                    language_id: "",
                    title: "",
                  },
                });
              },
              true,
            )}
            {!!form.subject_ids.length &&
              (catalogue.terms.find((t) => t.id === form.subject_ids[0])?.domain_ids.length || 0) >
                1 && (
                <label className="grid gap-2 text-sm font-medium">
                  Teaching category
                  <select
                    className="min-h-11 min-w-0 w-full rounded-xl border border-input bg-background px-3 py-2 text-base"
                    value={form.quick_setup.domain_id}
                    onChange={(e) =>
                      setup({
                        domain_id: e.target.value,
                        level_id: "",
                        curriculum_id: "",
                        exam_id: "",
                        language_id: "",
                      })
                    }
                  >
                    <option value="">Choose…</option>
                    {catalogue.domains
                      .filter((d) =>
                        catalogue.terms
                          .find((t) => t.id === form.subject_ids[0])
                          ?.domain_ids.includes(d.id),
                      )
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            {form.quick_setup.domain_id && (
              <>
                {select("LEVEL", "Students you teach", form.quick_setup.level_id, (id) =>
                  setup({ level_id: id }),
                )}
                {form.quick_setup.domain_id === "school" &&
                  select("CURRICULUM", "School board", form.quick_setup.curriculum_id || "", (id) =>
                    setup({ curriculum_id: id }),
                  )}
                {form.quick_setup.domain_id === "entrance" &&
                  select("EXAM", "Entrance exam", form.quick_setup.exam_id || "", (id) =>
                    setup({ exam_id: id }),
                  )}
                {select("LANGUAGE", "Teaching language", form.quick_setup.language_id, (id) =>
                  setup({ language_id: id }),
                )}
              </>
            )}
            <label className="grid gap-2 text-sm font-medium">
              Class mode
              <select
                className="min-h-11 min-w-0 w-full rounded-xl border border-input bg-background px-3 py-2 text-base"
                value={form.quick_setup.teaching_mode}
                onChange={(e) => setup({ teaching_mode: e.target.value as Setup["teaching_mode"] })}
              >
                <option value="ONLINE">Online</option>
                <option value="IN_PERSON">In person</option>
              </select>
            </label>
            {form.quick_setup.teaching_mode === "IN_PERSON" && (
              <>
                <Field
                  label="Your city"
                  maxLength={80}
                  value={form.quick_setup.city}
                  onChange={(e) => setup({ city: e.target.value })}
                />
                <Field
                  label="Country"
                  maxLength={80}
                  value={form.quick_setup.country}
                  onChange={(e) => setup({ country: e.target.value })}
                />
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Only your city is public. Do not enter a home address.
                </p>
              </>
            )}
          </fieldset>
          <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend className="mb-4 font-semibold">A little about you</legend>
            <Field
              label="Your public name"
              maxLength={80}
              value={form.display_name}
              onChange={(e) => field("display_name", e.target.value)}
            />
            <Field
              label="Hourly rate (INR)"
              type="number"
              min="1"
              max="100000"
              step="0.01"
              value={form.hourly_rate_paise ? form.hourly_rate_paise / 100 : ""}
              onChange={(e) => field("hourly_rate_paise", Math.round(Number(e.target.value) * 100))}
            />
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">
              About you and your classes
              <textarea
                className="min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-base"
                maxLength={1000}
                value={form.biography}
                placeholder="Tell students what you teach and how your classes work."
                onChange={(e) => field("biography", e.target.value)}
              />
            </label>
          </fieldset>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <legend className="mb-3 font-semibold">Your profile photo</legend>
            {photo && (
              <div className="flex items-center gap-3">
                <img
                  src={api.photoPreviewUrl(photo.id)}
                  alt="Your saved profile photo"
                  className="aspect-[4/5] w-20 rounded-xl object-cover"
                />
                <p className="text-sm">
                  {hasPublicationPhoto(photo)
                    ? "Photo saved · ready for your ad"
                    : "Photo needs attention. Upload a replacement."}
                </p>
              </div>
            )}
            <label className="grid gap-2 text-sm">
              {photo ? "Replace photo (optional)" : "Profile photo"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setPhotoConsent(false);
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Your own portrait, JPEG or PNG up to 1 MiB. You can save a draft without a photo.
            </p>
            {file && (
              <>
                <p className="break-words text-sm">
                  Selected: {file.name}. Uploads when you preview or save this form.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(e) => setPhotoConsent(e.target.checked)}
                  />
                  This is my own adult portrait, and I agree to show it publicly after approval.
                </label>
              </>
            )}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.adult_confirmed}
              disabled={busy}
              onChange={(e) => field("adult_confirmed", e.target.checked)}
            />
            I am at least 18 and will provide my own teaching services.
          </label>
          <details className="space-y-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Edit the suggested ad title (optional)
            </summary>
            <Field
              label="Ad title"
              disabled={busy}
              maxLength={160}
              value={title(form)}
              onChange={(e) => setup({ title: e.target.value })}
            />
          </details>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Preview my ad"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void action("save")}
            >
              Save draft
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Nothing goes online until you choose “Publish for free”. Add availability, optional
            identity verification and more subjects later.
          </p>
        </form>
      )}
    </section>
  );
}
