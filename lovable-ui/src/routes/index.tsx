import { PopularSubjects, HowItWorks, TutorLocations } from "@/components/homepage-discovery";
import { TeacherSearchBar } from "@/components/teacher-search-bar";
import { PublicTutorDirectory } from "@/components/public-tutor-profiles";
import { publicHead, requirePublic } from "@/lib/public-pages";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, GraduationCap } from "lucide-react";
import { SiteHeader, BrandWordmark } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { CatalogueBrowser } from "@/components/catalogue-browser";
import { PublicOfferCard } from "@/components/public-offer";
import { api, describeFailure, type Catalogue, type PublicOffer } from "@/lib/api";
import { Reveal } from "@/components/reveal";
import { homepageSections } from "@/lib/site-visibility";
export const Route = createFileRoute("/")({
  // The Tutor directory's first page loads with the page, so its first portrait
  // starts downloading straight away (it is often the largest paint on mobile).
  // A directory failure never blocks the homepage; the directory then loads itself.
  loader: async () => {
    const [home, tutors] = await Promise.all([api.publicHome(), api.publicTutors()]);
    return { ...requirePublic(home), tutors: tutors.ok ? tutors.data : null };
  },
  staleTime: 0,
  preloadStaleTime: 0,
  component: Index,
  head: ({ loaderData }) => publicHead(loaderData?.seo),
});
function Index() {
  const initial = Route.useLoaderData();
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<Catalogue>(initial.catalogue);
  const [offers, setOffers] = useState<PublicOffer[]>(initial.offers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const load = async () => {
    setLoading(true);
    setError(undefined);
    const results = await Promise.all([api.catalogue(), api.discover({ limit: 6 })]);
    const [terms, found] = results;
    if (terms.ok) setCatalogue(terms.data);
    else setError(describeFailure(terms.error));
    if (found.ok) setOffers(found.data.offers);
    else setError(describeFailure(found.error));
    setLoading(false);
  };
  useEffect(() => {
    setCatalogue(initial.catalogue);
    setOffers(initial.offers);
  }, [initial]);
  return (
    <div className="min-h-screen">
      <SiteHeader homepage />
      <main id="main-content" tabIndex={-1}>
        <section className="market-hero">
          <div className="mx-auto max-w-5xl px-5 text-center">
            <h1 className="market-title">
              Find your
              <br />
              <span>next teacher.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
              Online or in person. Find the teacher who fits you.
            </p>
            <TeacherSearchBar
              catalogue={catalogue}
              onSearch={(filters) => void navigate({ to: "/tutors", search: filters })}
            />
            <PopularSubjects catalogue={catalogue} />
          </div>
        </section>
        <div className="market-content pt-10">
          <PublicTutorDirectory
            initial={initial.tutors ?? undefined}
            initialCatalogue={catalogue}
            wide
          />
        </div>
        {homepageSections.teachingOffers && (offers.length > 0 || loading || error) && (
          <section aria-labelledby="available-title" className="market-content py-10 sm:py-14">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="available-title" className="text-xl font-semibold sm:text-2xl">
                  Meet your next teacher
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Online and in-person teaching offers. Tuition paid directly to your Tutor.
                </p>
              </div>
              <Link
                to="/tutors"
                className="inline-flex items-center gap-1 text-sm font-semibold text-coral-strong"
              >
                View all offers <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
            {loading ? (
              <div role="status" className="market-empty">
                Loading available teachers…
              </div>
            ) : error ? (
              <div role="alert" className="market-empty">
                <p>{error}</p>
                <Button variant="outline" className="mt-4 rounded-full" onClick={() => void load()}>
                  Retry available offers
                </Button>
              </div>
            ) : offers.length ? (
              <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                {/* The Tutor directory above holds the first, high-priority portrait;
                    these offers sit below it, so none of them competes for bandwidth. */}
                {offers.map((listing, i) =>
                  i === 0 ? (
                    <PublicOfferCard key={listing.id} listing={listing} catalogue={catalogue} />
                  ) : (
                    <Reveal key={listing.id} delay={(i % 3) * 70}>
                      <PublicOfferCard listing={listing} catalogue={catalogue} />
                    </Reveal>
                  ),
                )}
              </div>
            ) : (
              <div className="market-empty">
                <GraduationCap aria-hidden className="mx-auto mb-3 size-8 text-coral-strong" />
                <h3 className="text-lg font-semibold">Be part of our teaching community</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                  There are no available published offers yet. Explore learning domains or join as a
                  Tutor to share what you know.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {homepageSections.subjectExplorer && (
                    <Button asChild variant="outline" className="rounded-full">
                      <a href="#subjects">Explore subjects</a>
                    </Button>
                  )}
                  <Button asChild className="rounded-full">
                    <Link to="/auth/signup">Become a Tutor</Link>
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
        {homepageSections.howItWorks && <HowItWorks />}
        {homepageSections.howItWorks && initial.categories.length > 0 && (
          <nav
            aria-label="Available subject categories"
            className="market-content flex flex-wrap gap-3 pb-8"
          >
            {initial.categories.map((category) => (
              <Link
                key={category.path}
                to="/learn/$domain/$subject"
                params={{ domain: category.domain_id, subject: category.subject_id }}
                className="rounded-full border px-4 py-2 text-sm hover:bg-secondary"
              >
                {category.label} {String.fromCharCode(0xb7)} {category.domain} ({category.offers})
              </Link>
            ))}
          </nav>
        )}
        <section id="tutors" className="market-content py-14">
          <Reveal className="market-tutor-banner">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-coral-strong">
                For teachers
              </p>
              <h2 className="text-2xl font-semibold sm:text-3xl">
                Your knowledge. Someone’s new beginning.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Share the subjects you love. Create your free profile and publish your ad for free.
                Identity verification is optional.
              </p>
            </div>
            <Button asChild className="shrink-0 rounded-full px-6">
              <Link to="/auth/signup">
                Give private classes <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </Reveal>
        </section>
        <TutorLocations />
        {homepageSections.subjectExplorer && (
          <div className="market-catalogue">
            <CatalogueBrowser initialCatalogue={catalogue} />
          </div>
        )}
      </main>
      <footer className="border-t">
        <div className="market-content flex flex-wrap items-center justify-between gap-4 py-7">
          <Link to="/" aria-label="Tutor Marketplace home" className="brand-link">
            <BrandWordmark className="brand-wordmark-footer" />
          </Link>
          <p className="text-xs text-muted-foreground">Made for curious minds across India.</p>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap items-center gap-5 text-sm font-medium"
          >
            <Link to="/tutors">Find Tutors</Link>
            {homepageSections.howItWorks && <a href="#how-it-works">How it works</a>}
            <a href="#tutors">For teachers</a>
            <Link to="/community">Community</Link>
            <Link to="/feedback">Beta feedback</Link>
            <Link to="/auth/signin">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
