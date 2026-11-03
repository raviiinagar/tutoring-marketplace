import { compactTutorLocation, compactTutorRate } from "./tutor-card-summary";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  api,
  describeFailure,
  type PublicTutor,
  type Catalogue,
  type DiscoveryFilters,
} from "@/lib/api";
import { TutorPortrait } from "./tutor-portrait";
import { Button } from "./ui/button";
import { Notice } from "./account/ui";
import { SaveTutorButton } from "./save-tutor-button";
export function PublicTutorCard({
  profile,
  catalogue,
  priority = false,
  onSavedChange,
}: {
  profile: PublicTutor;
  catalogue?: Catalogue | undefined;
  priority?: boolean;
  onSavedChange?: ((saved: boolean) => void) | undefined;
}) {
  const subjects = profile.subject_ids
    .map(
      (id) =>
        catalogue?.terms.find((t) => t.id === id)?.label ||
        id.replace(/^subject-/, "").replaceAll("-", " "),
    )
    .join(", ");
  return (
    <article className="teacher-card" aria-label={`Tutor ${profile.display_name}`}>
      <div className="relative">
        <Link
          to="/profiles/$profileId"
          params={{ profileId: profile.id }}
          className="teacher-cover"
          aria-label={`View Tutor ${profile.display_name}`}
        >
          <span aria-hidden className="teacher-initials">
            {profile.display_name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((s) => s[0])
              .join("")
              .toUpperCase()}
          </span>
          <TutorPortrait
            card
            priority={priority}
            url={profile.photo_url ?? undefined}
            name={profile.display_name}
            className="teacher-portrait"
          />
          <div className="teacher-cover-caption">
            <h3 className="teacher-cover-name">{profile.display_name}</h3>
            <p className="teacher-cover-location">{compactTutorLocation(profile.presence)}</p>
          </div>
        </Link>
        <div className="absolute right-3 top-3 z-10">
          <SaveTutorButton
            profileId={profile.id}
            displayName={profile.display_name}
            photoUrl={profile.photo_url ?? undefined}
            compact
            onSavedChange={onSavedChange}
          />
        </div>
      </div>
      <div className="teacher-card-details">
        {profile.presence?.accepting_students === false && (
          <p className="teacher-card-paused">Not accepting new students</p>
        )}
        <Link
          className="teacher-card-summary"
          to="/profiles/$profileId"
          params={{ profileId: profile.id }}
        >
          <span className="font-medium">{subjects}</span>
          {subjects ? " " + String.fromCharCode(0xb7) + " " : ""}
          {profile.biography}
        </Link>
        <p
          className="teacher-card-price"
          title="Tutor's stated hourly tuition. See the profile for current offer terms."
        >
          {compactTutorRate(profile.hourly_rate_paise)}
          <span>/hr</span>
        </p>
      </div>
    </article>
  );
}

export function PublicTutorDirectory({
  filters = {},
  showSubjectFilter = false,
}: {
  filters?: DiscoveryFilters;
  showSubjectFilter?: boolean;
}) {
  const filterKey = JSON.stringify(filters),
    latest = useRef(0);
  const advanced = !!(
    filters.trial_kind ||
    filters.sort ||
    filters.domain_id ||
    filters.level_id ||
    filters.curriculum_id ||
    filters.exam_id ||
    filters.language_id ||
    filters.rate_unit ||
    filters.min_rate_paise !== undefined ||
    filters.max_rate_paise !== undefined
  );
  const [profiles, setProfiles] = useState<PublicTutor[]>(),
    [catalogue, setCatalogue] = useState<Catalogue>(),
    [subject, setSubject] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState<string>();
  useEffect(() => {
    void api.catalogue().then((r) => {
      if (r.ok) setCatalogue(r.data);
    });
  }, []);
  const load = async (next?: string) => {
    setError(undefined);
    const attempt = ++latest.current;
    if (advanced) {
      setProfiles([]);
      setCursor(null);
      return;
    }
    const r = await api.publicTutors(filters.subject_id || subject || undefined, next, filters);
    if (attempt !== latest.current) return;
    if (r.ok) {
      setProfiles((old) => (next ? [...(old || []), ...r.data.profiles] : r.data.profiles));
      setCursor(r.data.next_cursor);
    } else setError(describeFailure(r.error));
  };
  useEffect(() => {
    setProfiles(undefined);
    void load();
    return () => {
      latest.current++;
    };
  }, [subject, filterKey]);
  return (
    <section aria-label="Tutor profiles" className="mb-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Meet our Tutors</h2>
        </div>
        {showSubjectFilter && (
          <label className="text-sm font-semibold">
            Profile subject
            <select
              className="input mt-2"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">All subjects</option>
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
      </div>
      {advanced ? (
        <p className="text-sm text-muted-foreground">
          See the teaching offers below for your exact learning goal and price filters.
        </p>
      ) : error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button onClick={() => void load()}>Retry profiles</Button>
        </>
      ) : profiles === undefined ? (
        <p role="status">Loading Tutor profiles…</p>
      ) : profiles.length ? (
        <div className="tutor-card-grid grid sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p, index) => (
            <PublicTutorCard key={p.id} profile={p} catalogue={catalogue} priority={index === 0} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border bg-secondary p-6 text-sm">
          No Tutor profiles match these filters yet. Try another subject, city or time, or browse
          available teaching offers below.
        </p>
      )}
      {cursor && (
        <Button variant="outline" onClick={() => void load(cursor)}>
          More profiles
        </Button>
      )}
    </section>
  );
}
