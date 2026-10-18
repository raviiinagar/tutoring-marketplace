import { useEffect } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { SiteHeader } from "@/components/account/ui";
import { PublicOfferCard, PublicOfferTerms } from "@/components/public-offer";
import { TutorPortrait } from "@/components/tutor-portrait";
import { ContactRequestForm } from "@/components/contact-request-form";
import { PublicReviews } from "@/components/reviews";
import { AvailabilitySignup } from "@/components/availability-signup";
import type { PublicTeacherPage, PublicCategoryPage } from "@/lib/api";
export function PublicRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => void router.invalidate();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);
  return null;
}
export function TeacherPage({ page }: { page: PublicTeacherPage }) {
  const { listing, catalogue } = page;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <Link to="/tutors" className="link">
          Back to Tutor search
        </Link>
        <section className="mt-8 grid gap-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <TutorPortrait
              url={listing.tutor.photo_url}
              name={listing.tutor.display_name}
              className="mb-5 aspect-[4/5] w-48 rounded-xl object-cover"
            />
            <p className="mb-2 font-semibold text-muted-foreground">{listing.tutor.display_name}</p>
            <h1 className="break-words text-3xl font-semibold sm:text-4xl">
              {listing.offer.title}
            </h1>
            <p className="mt-6 whitespace-pre-wrap break-words leading-relaxed">
              {listing.offer.description}
            </p>
          </div>
          <aside className="rounded-xl bg-secondary p-5">
            <p className="mb-4 text-sm font-semibold text-success">Currently available online</p>
            <PublicOfferTerms offer={listing.offer} catalogue={catalogue} />
            <p className="mt-5 text-xs text-muted-foreground">
              Tuition and any trial fee are paid directly to the Tutor. Browsing this offer is free.
            </p>
          </aside>
        </section>
        <PublicReviews listingId={listing.id} />
        <ContactRequestForm key={listing.id + listing.revision} listing={listing} />
        <section className="mt-8 rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Evidence reviewed</h2>
          <ul className="mt-4 space-y-3">
            {listing.evidence_labels.map((check, i) => (
              <li key={i} className="rounded-xl bg-secondary p-4">
                <p className="font-semibold">{check.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Approval expires {check.expires_at.slice(0, 10)}.
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">{listing.verification_disclaimer}</p>
        <p className="mt-3 text-sm text-muted-foreground">Personal contact details and identity documents stay private.</p></section>
        <Link
          to="/learn/$domain/$subject"
          params={{ domain: listing.offer.domain_id, subject: listing.offer.subject_id }}
          className="link mt-6 inline-block"
        >
          Explore this subject and Learning Domain
        </Link>
      </main>
    </div>
  );
}
export function CategoryPage({ page }: { page: PublicCategoryPage }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-5 py-10 lg:px-8">
        <Link to="/tutors" className="link">
          Explore all Tutors
        </Link>
        <header className="my-8 max-w-3xl">
          <p className="text-sm font-semibold text-primary">{page.domain.label}</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Learn {page.subject.label} with an online Tutor
          </h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Compare exact teaching combinations, Learner Levels and tuition units. Browse freely and
            pay tuition directly to your Tutor. The platform Access Pass covers eligible
            connections; it does not book a lesson.
          </p>
        </header>
        <p className="mb-5 text-sm">{page.offers.length} currently available teaching offers.</p>
        {page.offers.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {page.offers.map((listing) => (
              <PublicOfferCard key={listing.id} listing={listing} catalogue={page.catalogue} />
            ))}
          </div>
        ) : (
          <section className="rounded-2xl border bg-secondary p-6">
            <h2 className="text-xl font-semibold">No available Tutors in this category</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Catalogue coverage is separate from current Tutor supply. This page does not imply
              availability or a growing market.
            </p>
            <AvailabilitySignup
              filters={{ domain_id: page.domain.id, subject_id: page.subject.id }}
            />
          </section>
        )}
      </main>
    </div>
  );
}

export function PublicTeacherMissing(){return <div className="min-h-screen"><SiteHeader/><main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 py-12"><h1 className="text-3xl font-semibold">This offer is currently unavailable</h1><p className="mt-4 text-muted-foreground">The offer may be paused or its approval may have changed.</p><Link to="/tutors" className="link mt-6 inline-block">Back to Tutor search</Link></main></div>;}
