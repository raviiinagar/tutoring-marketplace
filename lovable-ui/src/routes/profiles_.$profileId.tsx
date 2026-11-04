import { TutorPresenceSummary } from "@/components/tutor-presence-summary";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicTutorReputation } from "@/components/public-tutor-reputation";
import { useEffect, useState } from "react";
import { api, describeFailure, type PublicTutor, type Catalogue } from "@/lib/api";
import { SiteHeader, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { SaveTutorButton } from "@/components/save-tutor-button";
import { ShareTutorButton } from "@/components/share-tutor-button";
import { TutorProfileLayout, IdentityReviewNote } from "@/components/tutor-profile-layout";
export const Route = createFileRoute("/profiles_/$profileId")({
  ssr: false,
  component: Profile,
  head: () => ({
    meta: [{ title: "Tutor profile — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
function Profile() {
  const { profileId } = Route.useParams();
  const [p, setProfile] = useState<PublicTutor>(),
    [catalogue, setCatalogue] = useState<Catalogue>(),
    [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    setProfile(undefined);
    setError(undefined);
    setCatalogue(undefined);
    void Promise.all([api.publicTutor(profileId), api.catalogue()]).then(([a, b]) => {
      if (!live) return;
      if (a.ok) setProfile(a.data.profile);
      else setError(describeFailure(a.error));
      if (b.ok) setCatalogue(b.data);
    });
    return () => {
      live = false;
    };
  }, [profileId]);
  if (!p)
    return (
      <>
        <SiteHeader />
        <main id="main-content" className="mx-auto max-w-6xl px-5 py-10">
          <Link to="/tutors" className="link">
            Back to Tutor search
          </Link>
          <div className="mt-6">
            {error ? <Notice tone="error">{error}</Notice> : <p role="status">Loading profile…</p>}
          </div>
        </main>
      </>
    );
  const subjects = p.subject_ids.map(
    (id) => catalogue?.terms.find((t) => t.id === id)?.label || id.replace("subject-", ""),
  );
  return (
    <TutorProfileLayout
      name={p.display_name}
      photoUrl={p.photo_url}
      title={`Learn ${subjects.join(", ")} with ${p.display_name}`}
      subjects={subjects}
      navigation={[
        { id: "about", label: "About" },
        { id: "availability", label: "Location & availability" },
        { id: "teaching-offers", label: "Teaching offers" },
        { id: "recommendations", label: "Recommendations" },
      ]}
      actions={
        <>
          <SaveTutorButton
            profileId={p.id}
            displayName={p.display_name}
            photoUrl={p.photo_url ?? undefined}
          />
          <ShareTutorButton profileId={p.id} displayName={p.display_name} />
        </>
      }
      summary={
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Hourly rate</span>
            <p className="text-2xl font-semibold">
              ₹{(p.hourly_rate_paise / 100).toLocaleString("en-IN")}
              <span className="text-sm font-normal"> / hour</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Indicative tuition, arranged directly with the Tutor.
          </p>
          <a
            href="#teaching-offers"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {p.offers.length ? "View teaching offers" : "Contact & teaching offers"}
          </a>
          {p.contact && (
            <a
              className="block break-all text-center text-sm font-medium underline"
              href={"mailto:" + p.contact.email}
            >
              Email {p.display_name}
            </a>
          )}
        </>
      }
    >
      <IdentityReviewNote label={p.identity_label}>
        {p.expertise_label}. Identity review does not verify teaching qualifications or guarantee
        outcomes.
      </IdentityReviewNote>
      <section id="about" className="scroll-mt-28">
        <h2 className="text-2xl font-semibold">About {p.display_name}</h2>
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
          {p.biography}
        </p>
      </section>
      <section id="availability" className="scroll-mt-28 border-t pt-7">
        <h2 className="mb-4 text-2xl font-semibold">Location & availability</h2>
        <TutorPresenceSummary presence={p.presence} detail />
      </section>
      <section id="teaching-offers" className="scroll-mt-28 border-t pt-7">
        <h2 className="text-2xl font-semibold">Contact & teaching offers</h2>
        {p.contact && (
          <p className="mt-4 break-words text-sm">
            Public email, shared with the Tutor's consent:{" "}
            <a className="break-all font-medium underline" href={"mailto:" + p.contact.email}>
              {p.contact.email}
            </a>
          </p>
        )}
        {p.offers.length ? (
          <div className="mt-5 space-y-4">
            {p.offers.map((offer) => (
              <article key={offer.id} className="rounded-2xl border p-5">
                <h3 className="break-words text-lg font-semibold">{offer.title}</h3>
                <p className="mt-2">
                  ₹{(offer.rate_paise / 100).toLocaleString("en-IN")} /{" "}
                  {offer.rate_unit.toLowerCase()}
                </p>
                <Button className="mt-4 rounded-full" variant="outline" asChild>
                  <Link to="/tutors/$listingId" params={{ listingId: offer.id }}>
                    View offer & send an enquiry
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-secondary p-5 text-sm leading-relaxed">
            No available teaching offers yet. Check back later to enquire about classes.
          </p>
        )}
        {!p.contact && (
          <p className="mt-4 text-sm text-muted-foreground">
            Public contact details are not available.
          </p>
        )}
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          In-app enquiries use the Learner Access Pass. Tuition is arranged and paid directly with
          the Tutor.
        </p>
      </section>
      <PublicTutorReputation profileId={p.id} />
    </TutorProfileLayout>
  );
}
