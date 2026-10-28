import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, assetUrl, describeFailure, type PublicTutor, type Catalogue } from "@/lib/api";
import { SiteHeader, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
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
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-5 py-10">
        <Link to="/tutors" className="text-sm text-coral-strong">
          ← Find Tutors
        </Link>
        {error ? (
          <Notice tone="error">{error}</Notice>
        ) : !p ? (
          <p role="status" className="mt-6">
            Loading profile…
          </p>
        ) : (
          <article className="mt-6 space-y-8 rounded-3xl border bg-card p-6 sm:p-10">
            <header className="flex flex-wrap items-center gap-5">
              {p.photo_url && (
                <img
                  className="h-40 w-32 rounded-2xl object-cover"
                  src={assetUrl(p.photo_url)}
                  alt={p.display_name}
                />
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-coral-strong">
                  Meet your next Tutor
                </p>
                <h1 className="break-words text-3xl font-semibold">{p.display_name}</h1>
                <p className="mt-3 text-sm text-success">{p.identity_label}</p>
                <p className="mt-2 text-lg font-semibold">
                  ₹{p.hourly_rate_paise / 100} / hour{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    indicative tuition
                  </span>
                </p>
              </div>
            </header>
            <section>
              <h2 className="text-xl font-semibold">Subjects & expertise</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.subject_ids.map((id) => (
                  <span key={id} className="rounded-full bg-secondary px-4 py-2 text-sm">
                    {catalogue?.terms.find((t) => t.id === id)?.label || id.replace("subject-", "")}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {p.expertise_label}. Identity review does not verify teaching qualifications or
                guarantee outcomes.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">About {p.display_name}</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
                {p.biography}
              </p>
            </section>
            <section className="space-y-3 rounded-2xl bg-secondary p-5">
              <h2 className="text-xl font-semibold">Contact & teaching offers</h2>
              {p.contact ? (
                <p className="break-all text-sm">
                  Public email, shared with the Tutor’s consent:{" "}
                  <a className="font-semibold underline" href={"mailto:" + p.contact.email}>
                    {p.contact.email}
                  </a>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Public contact details are not available. This Tutor can publish offers after
                  activating Tutor Pro.
                </p>
              )}
              {p.offers.length ? (
                p.offers.map((offer) => (
                  <div key={offer.id} className="rounded-xl border bg-card p-4">
                    <h3 className="font-semibold">{offer.title}</h3>
                    <p className="mt-1 text-sm">
                      ₹{offer.rate_paise / 100} / {offer.rate_unit.toLowerCase()}
                    </p>
                    <Button className="mt-3" variant="outline" asChild>
                      <Link to="/tutors/$listingId" params={{ listingId: offer.id }}>
                        View offer & send an enquiry
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm">
                  No available teaching offer yet. This page is the Tutor’s introduction.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                In-app enquiries use the Learner Access Pass. Tuition is arranged and paid directly
                with the Tutor.
              </p>
            </section>
          </article>
        )}
      </main>
    </>
  );
}
