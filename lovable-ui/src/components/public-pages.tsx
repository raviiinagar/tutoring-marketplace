import { useEffect } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { SiteHeader } from "@/components/account/ui";
import { PublicOfferCard, PublicOfferTerms } from "@/components/public-offer";
import { TutorProfileLayout } from "@/components/tutor-profile-layout";
import { TutorPresenceSummary } from "@/components/tutor-presence-summary";
import { Star } from "lucide-react";
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
  const name = listing.tutor.display_name;
  const label = (id: string) =>
    catalogue.terms.find((term) => term.id === id)?.label || id.replace("subject-", "");
  const review = listing.review_summary;
  return (
    <TutorProfileLayout
      name={name}
      photoUrl={listing.tutor.photo_url}
      title={listing.offer.title}
      subjects={[label(listing.offer.subject_id)]}
      navigation={[
        { id: "about-class", label: "About the class" },
        { id: "availability", label: "Location & availability" },
        { id: "reviews", label: "Reviews" },
        { id: "contact", label: "Contact" },
      ]}
      summary={
        <>
          <p className="rounded-full bg-amber-50 px-3 py-2 text-center text-xs font-medium">{listing.evidence_labels.some(check=>check.kind==='IDENTITY') ? 'Identity verified' : 'Identity not verified'}</p>
          {review && review.count > 0 && review.average !== null && (
            <a href="#reviews" className="flex items-center justify-center gap-1 text-sm">
              <Star aria-hidden className="size-4 fill-amber-400 text-amber-400" />
              {Number(review.average.toFixed(1))} ({review.count}{" "}
              {review.count === 1 ? "review" : "reviews"})
            </a>
          )}
          <PublicOfferTerms offer={listing.offer} catalogue={catalogue} />
          <a
            href="#contact"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Contact {name}
          </a>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tuition and any trial fee are paid directly to the Tutor. In-app enquiries use the
            Learner Access Pass.
          </p>
        </>
      }
    >
      <section id="about-class" className="scroll-mt-28">
        <h2 className="text-2xl font-semibold">About the class</h2>
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
          {listing.offer.description}
        </p>
      </section>
      <section id="availability" className="scroll-mt-28 border-t pt-7">
        <h2 className="mb-4 text-2xl font-semibold">Location & availability</h2>
        <TutorPresenceSummary
          presence={
            listing.presence ?? {
              revision: 0,
              location: listing.class_location ?? listing.offer.class_location ?? null,
              teaching_modes: [listing.offer.teaching_mode],
              accepting_students: null,
              weekly_slots: [],
              timezone: "Asia/Kolkata",
              updated_at: null,
            }
          }
          detail
        />
      </section>
      <section id="reviews" aria-label="Tutor reviews" className="scroll-mt-28">
        <PublicReviews listingId={listing.id} />
      </section>
      <div id="contact" className="scroll-mt-28">
        <ContactRequestForm key={listing.id + listing.revision} listing={listing} />
      </div>
      <details className="rounded-2xl border p-5">
        <summary className="cursor-pointer font-semibold">Review & verification details</summary>
        <ul className="mt-4 space-y-3">
          {listing.evidence_labels.map((check, i) => (
            <li key={i}>
              <p className="text-sm font-medium">{check.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Approval expires {check.expires_at.slice(0, 10)}.
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {listing.verification_disclaimer}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Private identity documents are never shown on this page.
        </p>
      </details>
      <Link
        to="/learn/$domain/$subject"
        params={{ domain: listing.offer.domain_id, subject: listing.offer.subject_id }}
        className="link mt-6 inline-block"
      >
        Explore this subject and Learning Domain
      </Link>
    </TutorProfileLayout>
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

export function PublicTeacherMissing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-3xl font-semibold">This offer is currently unavailable</h1>
        <p className="mt-4 text-muted-foreground">
          The offer may be paused or its approval may have changed.
        </p>
        <Link to="/tutors" className="link mt-6 inline-block">
          Back to Tutor search
        </Link>
      </main>
    </div>
  );
}
