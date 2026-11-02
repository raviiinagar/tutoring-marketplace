import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, Trash2 } from "lucide-react";
import { api, describeFailure, type Catalogue } from "@/lib/api";
import { useSavedTutors } from "@/lib/saved-tutors";
import { AuthShell, Notice } from "./account/ui";
import { Button } from "./ui/button";
import { PublicTutorCard } from "./public-tutor-profiles";

export function SavedTutorsPage() {
  return (
    <AuthShell
      title="Saved Tutors"
      wide
      intro="Keep a shortlist of Tutors you would like to learn with. Saving is free and does not send an enquiry."
    >
      <SavedTutorList />
    </AuthShell>
  );
}

export function SavedTutorList() {
  const saved = useSavedTutors();
  const [catalogue, setCatalogue] = useState<Catalogue>(),
    [removing, setRemoving] = useState<string>(),
    [error, setError] = useState<string>();
  const flight = useRef(false);
  useEffect(() => {
    let live = true;
    void api.catalogue().then((result) => {
      if (live && result.ok) setCatalogue(result.data);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => setError(undefined), [saved.accountId]);
  const remove = async (id: string) => {
    if (flight.current) return;
    flight.current = true;
    setRemoving(id);
    setError(undefined);
    try {
      const result = await api.removeSavedTutor(id);
      if (!result.ok) {
        setError(describeFailure(result.error));
        return;
      }
      await saved.invalidate();
    } catch {
      setError("Could not remove this Tutor. Please try again.");
    } finally {
      flight.current = false;
      setRemoving(undefined);
    }
  };
  if (saved.checkingAccount || saved.loading)
    return (
      <p role="status" className="mt-6">
        Loading your saved Tutors…
      </p>
    );
  if (saved.anonymous)
    return (
      <div className="mt-6 rounded-2xl border bg-secondary p-6">
        <Heart aria-hidden className="mb-3 size-6 text-primary" />
        <p>Sign in to keep your saved Tutors together across devices.</p>
        <Button className="mt-4" asChild>
          <Link to="/auth/signin">Sign in to view saved Tutors</Link>
        </Button>
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
      <div className="mt-6 rounded-2xl border bg-secondary p-8 text-center">
        <Heart aria-hidden className="mx-auto mb-4 size-8 text-primary" />
        <h2 className="text-xl font-semibold">Your shortlist starts here</h2>
        <p className="mt-3 text-muted-foreground">
          Tap the heart on a Tutor profile to save it here. You can save up to {saved.limit} Tutors.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/tutors">Find Tutors</Link>
        </Button>
      </div>
    );
  return (
    <section className="mt-6" aria-label="Your saved Tutors">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {saved.items.length} of {saved.limit} Tutors saved. Availability and public details are
          checked each time.
        </p>
        <Button variant="outline" type="button" onClick={() => void saved.refresh()}>
          Refresh saved Tutors
        </Button>
      </div>
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {saved.items.map((item) =>
          item.profile ? (
            <PublicTutorCard key={item.profile_id} profile={item.profile} catalogue={catalogue} />
          ) : (
            <article
              key={item.profile_id}
              className="flex flex-col justify-center rounded-3xl border bg-secondary p-6"
            >
              <h2 className="text-lg font-semibold">Tutor currently unavailable</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                This profile may be paused, removed or waiting for approval. Its private details are
                not shown.
              </p>
              <Button
                className="mt-5"
                variant="outline"
                type="button"
                disabled={!!removing}
                onClick={() => void remove(item.profile_id)}
              >
                <Trash2 aria-hidden className="size-4" />
                {removing === item.profile_id ? "Removing…" : "Remove unavailable Tutor"}
              </Button>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
