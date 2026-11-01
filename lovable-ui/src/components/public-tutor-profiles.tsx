import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { api, describeFailure, type PublicTutor, type Catalogue } from "@/lib/api";
import { TutorPortrait } from "./tutor-portrait";
import { Button } from "./ui/button";
import { Notice } from "./account/ui";
export function PublicTutorCard({
  profile,
  catalogue,
}: {
  profile: PublicTutor;
  catalogue?: Catalogue | undefined;
}) {
  return (
    <article className="teacher-card flex h-full flex-col">
      <Link
        to="/profiles/$profileId"
        params={{ profileId: profile.id }}
        className="teacher-cover"
        aria-label={`View Tutor ${profile.display_name}`}
      >
        <span aria-hidden className="teacher-initials">
          {profile.display_name
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <TutorPortrait
          card
          url={profile.photo_url ?? undefined}
          name={profile.display_name}
          className="teacher-portrait"
        />
        <span className="teacher-cover-note">Tutor profile</span>
        <h3 className="teacher-cover-name">{profile.display_name}</h3>
      </Link>
      <div className="flex flex-1 flex-col px-1 py-4">
        <p className="mt-1 flex items-center gap-1 text-xs text-success">
          <ShieldCheck aria-hidden className="size-3.5" />
          Identity reviewed
        </p>
        <p className="mt-4 text-sm font-semibold">
          {profile.subject_ids
            .map(
              (id) =>
                catalogue?.terms.find((t) => t.id === id)?.label || id.replace("subject-", ""),
            )
            .join(" · ")}
        </p>
        <p className="mt-3 line-clamp-3 break-words text-sm text-muted-foreground">
          {profile.biography}
        </p>
        <p className="mt-4 font-semibold">
          ₹{profile.hourly_rate_paise / 100}
          <span className="text-sm font-normal text-muted-foreground">
            {" "}
            / hour · indicative tuition
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Self-declared skills & experience</p>
        <div className="mt-auto pt-4">
          <Button className="w-full" variant="outline" asChild>
            <Link to="/profiles/$profileId" params={{ profileId: profile.id }}>
              View profile <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
export function PublicTutorDirectory() {
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
    const r = await api.publicTutors(subject || undefined, next);
    if (r.ok) {
      setProfiles((old) => (next ? [...(old || []), ...r.data.profiles] : r.data.profiles));
      setCursor(r.data.next_cursor);
    } else setError(describeFailure(r.error));
  };
  useEffect(() => {
    setProfiles(undefined);
    void load();
  }, [subject]);
  return (
    <section aria-label="Tutor profiles" className="mb-12 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Meet our Tutors</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Browse identity-reviewed introductions for free. Skills and experience are
            self-declared. Available teaching offers are shown separately below.
          </p>
        </div>
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
      </div>
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button onClick={() => void load()}>Retry profiles</Button>
        </>
      ) : profiles === undefined ? (
        <p role="status">Loading Tutor profiles…</p>
      ) : profiles.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <PublicTutorCard key={p.id} profile={p} catalogue={catalogue} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border bg-secondary p-6 text-sm">
          No approved profiles for this Subject yet. Browse available teaching offers below or try
          another Subject.
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
