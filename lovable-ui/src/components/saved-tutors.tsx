import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, Trash2, Search, ArrowUpRight } from "lucide-react";
import { api, describeFailure, type Catalogue } from "@/lib/api";
import { useSavedTutors } from "@/lib/saved-tutors";
import { AuthShell, Notice } from "./account/ui";
import { Button } from "./ui/button";
import { PublicTutorCard } from "./public-tutor-profiles";

const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const fallbackLabel = (id: string) => id.replace(/^subject-/, "").replaceAll("-", " ");
export function SavedTutorsPage() {
  return (
    <AuthShell
      title="Saved Tutors"
      wide
      intro="Your favourite teachers, ready when you are. Saving is free and does not send an enquiry."
    >
      <SavedTutorList />
    </AuthShell>
  );
}
export function SavedTutorList() {
  const saved = useSavedTutors();
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [catalogueError, setCatalogueError] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const flight = useRef(false),
    searchInput = useRef<HTMLInputElement>(null),
    emptyTitle = useRef<HTMLHeadingElement>(null);
  const identity = useRef(saved.accountId);
  identity.current = saved.accountId;
  useEffect(() => {
    setError(undefined);
    setNotice("");
    setQuery("");
    setSubject("");
  }, [saved.accountId]);
  const loadLabels = async () => {
    setCatalogueError(false);
    const result = await api.catalogue();
    if (result.ok) setCatalogue(result.data);
    else setCatalogueError(true);
  };
  useEffect(() => {
    let active = true;
    void api.catalogue().then((result) => {
      if (!active) return;
      if (result.ok) setCatalogue(result.data);
      else setCatalogueError(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const label = (id: string) =>
    catalogue?.terms.find((term) => term.id === id)?.label || fallbackLabel(id);
  const available = (saved.items ?? []).filter((item) => item.profile !== null);
  const unavailable = (saved.items ?? []).filter((item) => item.profile === null);
  const subjects = [...new Set(available.flatMap((item) => item.profile?.subject_ids ?? []))].sort(
    (a, b) => label(a).localeCompare(label(b)),
  );
  useEffect(() => {
    if (subject && saved.items && !subjects.includes(subject)) setSubject("");
  }, [subject, JSON.stringify(subjects), saved.items]);
  const search = normalize(query);
  const filtered = available.filter((item) => {
    const p = item.profile!;
    const subjectNames = p.subject_ids.flatMap((id) => {
      const term = catalogue?.terms.find((t) => t.id === id);
      return [label(id), ...(term?.aliases ?? [])];
    });
    const location = p.presence?.location;
    return (
      (!subject || p.subject_ids.includes(subject)) &&
      (!search ||
        [
          p.display_name,
          p.biography,
          ...subjectNames,
          location?.city,
          location?.area,
          location?.country,
        ].some((text) => text && normalize(text).includes(search)))
    );
  });
  const restoreFocus = () =>
    requestAnimationFrame(() => (searchInput.current ?? emptyTitle.current)?.focus());
  const remove = async (id: string) => {
    if (flight.current) return;
    const owner = saved.accountId;
    flight.current = true;
    setRemoving(id);
    setError(undefined);
    try {
      const result = await api.removeSavedTutor(id);
      if (owner !== identity.current) return;
      if (!result.ok) {
        setError(describeFailure(result.error));
        return;
      }
      await saved.invalidate();
      if (owner !== identity.current) return;
      setNotice("Unavailable Tutor removed from your saved Tutors.");
      restoreFocus();
    } catch {
      if (owner === identity.current) setError("Could not remove this Tutor. Please try again.");
    } finally {
      flight.current = false;
      setRemoving(undefined);
    }
  };
  const announcement = (
    <p role="status" aria-live="polite" className="saved-list-announcement">
      {notice}
    </p>
  );
  if (saved.checkingAccount || saved.loading)
    return (
      <p role="status" className="mt-6">
        Loading your saved Tutors...
      </p>
    );
  if (saved.anonymous)
    return (
      <div className="saved-empty mt-6">
        <Heart aria-hidden className="size-9" />
        <h2>Keep the teachers you love</h2>
        <p>Sign in to keep your saved Tutors together across devices.</p>
        <Button asChild>
          <Link to="/auth/signin">Sign in to view saved Tutors</Link>
        </Button>
        <Link to="/tutors" className="saved-browse-link">
          Keep browsing Tutors <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      </div>
    );
  const loadError = saved.sessionError || saved.error;
  if (loadError)
    return (
      <div className="mt-6">
        <Notice tone="error">{loadError}</Notice>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void (saved.sessionError ? saved.refreshSession() : saved.refresh())}
        >
          Retry saved Tutors
        </Button>
      </div>
    );
  if (!saved.items?.length)
    return (
      <>
        {announcement}
        <div className="saved-empty mt-6">
          <Heart aria-hidden className="size-9" />
          <h2 ref={emptyTitle} tabIndex={-1}>
            Your shortlist starts here
          </h2>
          <p>
            Tap the heart on a Tutor profile to save it here. You can save up to {saved.limit}{" "}
            Tutors.
          </p>
          <Button asChild>
            <Link to="/tutors">Find Tutors</Link>
          </Button>
        </div>
      </>
    );
  return (
    <section className="saved-tutor-list mt-6" aria-label="Your saved Tutors">
      <div className="saved-list-heading">
        <div>
          <p className="saved-list-count">
            {saved.items.length} {saved.items.length === 1 ? "Tutor" : "Tutors"} saved
          </p>
          <p className="text-sm text-muted-foreground">
            {unavailable.length ? `${unavailable.length} currently unavailable. ` : ""}Up to{" "}
            {saved.limit} Tutors. Details are checked each time.
          </p>
        </div>
        <Link to="/tutors" className="saved-browse-link">
          Find more Tutors <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      </div>
      {announcement}
      {error && <Notice tone="error">{error}</Notice>}
      {available.length > 0 && (
        <>
          <div className="saved-list-tools">
            <div className="saved-list-search">
              <Search aria-hidden className="size-5 shrink-0" />
              <label htmlFor="saved-search" className="sr-only">
                Search saved Tutors
              </label>
              <input
                ref={searchInput}
                id="saved-search"
                type="search"
                placeholder="Name, subject or city"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <label className="saved-subject-filter">
              <span>Subject</span>
              <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                <option value="">All subjects</option>
                {subjects.map((id) => (
                  <option value={id} key={id}>
                    {label(id)}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" type="button" onClick={() => void saved.refresh()}>
              Refresh saved Tutors
            </Button>
          </div>
          {catalogueError && (
            <p className="mb-4 text-sm">
              Subject names could not be loaded.{" "}
              <button type="button" className="underline" onClick={() => void loadLabels()}>
                Retry subject names
              </button>
            </p>
          )}
          <p className="mb-5 text-sm text-muted-foreground" role="status">
            {filtered.length} of {available.length} saved Tutor{" "}
            {available.length === 1 ? "profile" : "profiles"}
            {query.trim() || subject ? " match your filters" : ""}
          </p>
          {filtered.length ? (
            <div className="tutor-card-grid grid sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item, index) => (
                <PublicTutorCard
                  key={item.profile_id}
                  profile={item.profile!}
                  catalogue={catalogue}
                  priority={index === 0}
                  onSavedChange={(isSaved) => {
                    if (!isSaved) {
                      setNotice(`${item.profile!.display_name} removed from your saved Tutors.`);
                      restoreFocus();
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="saved-empty saved-filter-empty">
              <h2>No saved Tutors match</h2>
              <p>Try a different name, subject or city.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setSubject("");
                  searchInput.current?.focus();
                }}
              >
                Clear saved Tutor filters
              </Button>
            </div>
          )}
        </>
      )}
      {unavailable.length > 0 && (
        <section className="saved-unavailable" aria-label="Unavailable saved Tutors">
          <h2 className="mb-4 text-lg font-semibold">Currently unavailable</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {unavailable.map((item) => (
              <article key={item.profile_id} className="saved-unavailable-card">
                <Heart aria-hidden className="size-6 text-muted-foreground" />
                <h3>Tutor currently unavailable</h3>
                <p>
                  This profile may be paused, removed or waiting for approval. Private details are
                  not shown.
                </p>
                <Button
                  variant="outline"
                  type="button"
                  disabled={!!removing}
                  onClick={() => void remove(item.profile_id)}
                >
                  <Trash2 aria-hidden className="size-4" />
                  {removing === item.profile_id ? "Removing..." : "Remove unavailable Tutor"}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
