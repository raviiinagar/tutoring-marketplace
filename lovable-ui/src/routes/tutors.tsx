import { TeacherSearchBar } from "@/components/teacher-search-bar";
import { PublicTutorDirectory } from "@/components/public-tutor-profiles";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TutorSearchFilters } from "@/components/tutor-search-filters";
import { hasOfferOnlyFilters, mergeTeacherSearch } from "@/lib/discovery-filter-state";
import {
  api,
  describeFailure,
  type Catalogue,
  type DiscoveryFilters,
  type DiscoveryPage,
} from "@/lib/api";
import { SiteHeader, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { PublicOfferCard } from "@/components/public-offer";
import { AvailabilitySignup } from "@/components/availability-signup";
const filterNames = [
  "sort",
  "trial_kind",
  "location",
  "country",
  "teaching_mode",
  "day",
  "at_time",
  "accepting_only",
  "domain_id",
  "subject_id",
  "level_id",
  "curriculum_id",
  "exam_id",
  "language_id",
  "rate_unit",
  "min_rate_paise",
  "max_rate_paise",
  "cursor",
] as const;
export const Route = createFileRoute("/tutors")({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): DiscoveryFilters => {
    const value: Record<string, unknown> = {};
    for (const key of filterNames) {
      if (raw[key] !== undefined && raw[key] !== "")
        value[key] = key.endsWith("_paise") || key === "at_time" ? Number(raw[key]) : raw[key];
    }
    return value as DiscoveryFilters;
  },
  component: TutorSearch,
  head: () => ({
    meta: [
      { title: "Find your next Tutor — Tutor Marketplace" },
      {
        name: "description",
        content:
          "Browse currently available, reviewed online and in-person teaching offers across eight learning domains in India.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
});
function TutorSearch() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [page, setPage] = useState<DiscoveryPage>();
  const [error, setError] = useState<string>();
  const [catalogueError, setCatalogueError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const observation = useRef<{ filters: string; key: string } | undefined>(undefined);
  const key = JSON.stringify(search);
  const loadCatalogue = async () => {
    setCatalogueError(undefined);
    const r = await api.catalogue();
    if (r.ok) setCatalogue(r.data);
    else setCatalogueError(describeFailure(r.error));
  };
  useEffect(() => {
    void loadCatalogue();
  }, []);
  const load = async () => {
    const attempt = ++latest.current;
    setLoading(true);
    setPage(undefined);
    setError(undefined);
    const shape = JSON.stringify({ ...search, limit: 12 });
    if (observation.current?.filters !== shape)
      observation.current = { filters: shape, key: crypto.randomUUID() };
    const r = await api.observedSearch({ ...search, limit: 12 }, observation.current.key);
    if (attempt !== latest.current) return;
    if (r.ok) setPage(r.data);
    else setError(describeFailure(r.error));
    setLoading(false);
  };
  useEffect(() => {
    void load();
    return () => {
      latest.current++;
    };
  }, [key]);
  const applyFilters = (filters: DiscoveryFilters) => {
    const next = { ...filters, cursor: undefined };
    if (
      !search.cursor &&
      filterNames.every((field) => field === "cursor" || next[field] === search[field])
    )
      void load();
    else void navigate({ to: "/tutors", search: next });
  };
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="mb-8 animate-rise">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-coral-strong">
            Find your next learning chapter
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">Find your next Tutor</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Choose the exact subject and learning goal you need. Browsing is free; tuition is paid
            directly to your Tutor.
          </p>
        </div>
        <TeacherSearchBar
          catalogue={catalogue}
          initial={search}
          onSearch={(filters) => {
            applyFilters(mergeTeacherSearch(search, filters, catalogue));
          }}
        />
        {catalogueError && (
          <div role="alert" className="mt-4">
            <p>{catalogueError}</p>
            <Button variant="outline" onClick={() => void loadCatalogue()}>
              Retry filter options
            </Button>
          </div>
        )}
        <div className="my-7">
          <TutorSearchFilters
            catalogue={catalogue}
            filters={search}
            loading={loading}
            onApply={applyFilters}
          />
        </div>
        {!hasOfferOnlyFilters(search) && (
          <PublicTutorDirectory filters={search} showSubjectFilter={false} />
        )}
        <h2 className="mb-5 text-2xl font-semibold">Available teaching offers</h2>
        <div>
          <section aria-label="Available teaching offers" aria-busy={loading}>
            {loading ? (
              <p role="status" className="rounded-2xl border p-8">
                Finding currently available offers…
              </p>
            ) : error ? (
              <div>
                <Notice tone="error">{error}</Notice>
                <Button className="mt-4" onClick={() => void load()}>
                  Retry search
                </Button>
              </div>
            ) : (
              page && (
                <>
                  <p role="status" className="mb-5 text-sm text-muted-foreground">
                    {page.offers.length} available teaching offer
                    {page.offers.length === 1 ? "" : "s"} on this page.
                  </p>
                  {!page.offers.length ? (
                    <div className="rounded-2xl border bg-secondary p-8">
                      <h2 className="text-xl font-semibold">No matching available Tutors</h2>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Try another learning goal or broaden your filters. Availability changes as
                        Tutors publish and pause their offers.
                      </p>
                      <p className="mt-3 text-sm">There is no charge for this search.</p>
                      <AvailabilitySignup key={key} filters={search} />
                    </div>
                  ) : (
                    <div className="tutor-card-grid grid sm:grid-cols-2 lg:grid-cols-3">
                      {page.offers.map((listing) => (
                        <PublicOfferCard key={listing.id} listing={listing} catalogue={catalogue} />
                      ))}
                    </div>
                  )}
                  <nav aria-label="Search pages" className="mt-6 flex flex-wrap gap-3">
                    {search.cursor && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          void navigate({ to: "/tutors", search: { ...search, cursor: undefined } })
                        }
                      >
                        First page
                      </Button>
                    )}
                    {page.next_cursor && (
                      <Button
                        onClick={() =>
                          void navigate({
                            to: "/tutors",
                            search: { ...search, cursor: page.next_cursor! },
                          })
                        }
                      >
                        Next offers
                      </Button>
                    )}
                  </nav>
                </>
              )
            )}
          </section>
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          Evidence reviews describe specific checks, not a guarantee of teaching quality or learning
          outcomes. Availability is checked again before a Contact Request can be authorized.
        </p>
      </main>
    </div>
  );
}
