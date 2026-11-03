import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  api,
  describeFailure,
  type Catalogue,
  type CatalogueKind,
  type CatalogueTerm,
} from "@/lib/api";
import { subjectShortcuts } from "./subject-shortcuts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  BookOpen,
  ArrowUpRight,
  Atom,
  GraduationCap,
  Compass,
  BriefcaseBusiness,
  Code,
  Languages,
  Palette,
  Search,
  ArrowRight,
} from "lucide-react";

export const catalogueLabels: Record<CatalogueKind, string> = {
  SUBJECT: "Subjects",
  LEVEL: "Learner levels",
  CURRICULUM: "Curricula",
  EXAM: "Exam tracks",
  LANGUAGE: "Teaching languages",
};
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const domainIcons: Record<string, typeof BookOpen> = {
  school: BookOpen,
  entrance: Atom,
  higher: GraduationCap,
  competitive: Compass,
  professional: BriefcaseBusiness,
  career: Code,
  languages: Languages,
  arts: Palette,
};
const filterKeys = {
  SUBJECT: "subject_id",
  EXAM: "exam_id",
  LEVEL: "level_id",
  CURRICULUM: "curriculum_id",
  LANGUAGE: "language_id",
} as const;
function TermLink({ term, domainId }: { term: CatalogueTerm; domainId: string }) {
  return (
    <Link
      to="/tutors"
      search={{ domain_id: domainId, [filterKeys[term.kind]]: term.id }}
      className="category-term-link"
    >
      <span>{term.label}</span>
      <ArrowUpRight aria-hidden className="size-4 shrink-0" />
    </Link>
  );
}

export function CatalogueBrowser({ initialCatalogue }: { initialCatalogue?: Catalogue }) {
  const [loaded, setLoaded] = useState<Catalogue>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string>();
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const catalogue = initialCatalogue ?? loaded;
  const load = async () => {
    setError(undefined);
    const result = await api.catalogue();
    if (result.ok) setLoaded(result.data);
    else setError(describeFailure(result.error));
  };
  useEffect(() => {
    if (initialCatalogue) return;
    let active = true;
    void api.catalogue().then((result) => {
      if (!active) return;
      if (result.ok) setLoaded(result.data);
      else setError(describeFailure(result.error));
    });
    return () => {
      active = false;
    };
  }, [initialCatalogue]);
  const priority = (id: string) => {
    const index = subjectShortcuts.findIndex((item) => item.id === id);
    return index < 0 ? subjectShortcuts.length : index;
  };
  const terms = (catalogue?.terms.filter((term) => term.active) ?? []).sort(
    (a, b) => priority(a.id) - priority(b.id),
  );
  const search = normalize(query);
  const matches = (term: CatalogueTerm) =>
    !search || [term.label, ...term.aliases].some((name) => normalize(name).includes(search));
  const groups = (catalogue?.domains ?? [])
    .filter((domain) => !category || domain.id === category)
    .map((domain) => {
      const domainMatches = !!search && normalize(domain.label).includes(search);
      const domainTerms = terms.filter((term) => term.domain_ids.includes(domain.id));
      const direct = domainTerms.filter(
        (term) => ["SUBJECT", "EXAM"].includes(term.kind) && (domainMatches || matches(term)),
      );
      return { domain, direct, visible: !search || domainMatches || direct.length > 0 };
    })
    .filter((group) => group.visible);
  const domain = catalogue?.domains.find((item) => item.id === selected);
  const reset = () => {
    setQuery("");
    setCategory("");
  };
  return (
    <section
      id="subjects"
      aria-labelledby="subjects-title"
      className="market-content subject-categories"
    >
      <div className="home-section-heading">
        <p className="home-kicker">Follow your curiosity</p>
        <h2 id="subjects-title">What would you like to learn?</h2>
        <p>Explore subjects and exams. Find the teacher who fits your next goal.</p>
      </div>
      <div className="category-search">
        <Search aria-hidden className="size-5 shrink-0" />
        <label htmlFor="category-search" className="sr-only">
          Search subjects or exams
        </label>
        <input
          id="category-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try Maths, IIT-JEE or English"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")}>
            Clear search
          </button>
        )}
      </div>
      {error ? (
        <div role="alert" className="mt-6">
          <p>{error}</p>
          <Button onClick={() => void load()}>Retry catalogue</Button>
        </div>
      ) : !catalogue ? (
        <p role="status" className="mt-6">
          Loading subjects...
        </p>
      ) : (
        <>
          <div role="group" aria-label="Learning domains" className="category-pills">
            <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>
              All subjects
            </button>
            {catalogue.domains.map((item) => {
              const Icon = domainIcons[item.id] ?? BookOpen;
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <p role="status" className="category-result-count">
            {groups.length} learning {groups.length === 1 ? "domain" : "domains"}
            {query.trim() ? ` matching "${query.trim()}"` : " to explore"}
          </p>
          {groups.length ? (
            <div className="category-grid">
              {groups.map(({ domain: item, direct }) => {
                const Icon = domainIcons[item.id] ?? BookOpen;
                const subjects = direct.filter((term) => term.kind === "SUBJECT");
                const exams = direct.filter((term) => term.kind === "EXAM");
                return (
                  <article
                    className="category-card"
                    key={item.id}
                    aria-labelledby={`category-${item.id}`}
                  >
                    <div className="category-card-heading">
                      <span className="category-icon">
                        <Icon aria-hidden />
                      </span>
                      <h3 id={`category-${item.id}`}>{item.label}</h3>
                    </div>
                    <div className="category-card-body">
                      {subjects.length > 0 && (
                        <div>
                          <h4>Subjects</h4>
                          <ul>
                            {subjects.slice(0, search ? undefined : 6).map((term) => (
                              <li key={term.id}>
                                <TermLink term={term} domainId={item.id} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {exams.length > 0 && (
                        <div>
                          <h4>Exam tracks</h4>
                          <ul>
                            {exams.slice(0, search ? undefined : 6).map((term) => (
                              <li key={term.id}>
                                <TermLink term={term} domainId={item.id} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!direct.length && (
                        <p className="text-sm text-muted-foreground">
                          Subjects will appear here as the catalogue grows.
                        </p>
                      )}
                    </div>
                    <div className="category-card-footer">
                      <button
                        type="button"
                        data-domain={item.id}
                        onClick={(event) => {
                          returnFocus.current = event.currentTarget;
                          setSelected(item.id);
                        }}
                      >
                        All {item.label.toLowerCase()} options{" "}
                        <ArrowRight aria-hidden className="size-4" />
                      </button>
                      <Link to="/tutors" search={{ domain_id: item.id }}>
                        View Tutors <ArrowUpRight aria-hidden className="size-4" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="category-empty">
              <h3>No matching subjects</h3>
              <p>Try another subject or exam name, or explore a different learning domain.</p>
              <Button variant="outline" onClick={reset}>
                Reset subject filters
              </Button>
            </div>
          )}
          <p className="category-availability-note">
            These are catalogue options. Search results show current teaching offers and
            availability.
          </p>
        </>
      )}
      <Dialog
        open={!!domain}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          className="catalogue-dialog max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-2xl"
        >
          {domain && catalogue && (
            <>
              <DialogTitle>{domain.label}</DialogTitle>
              <DialogDescription>
                Choose a subject, exam or learning option to find Tutors. Options do not confirm
                availability.
              </DialogDescription>
              <Button asChild>
                <Link to="/tutors" search={{ domain_id: domain.id }}>
                  Find Tutors in this domain
                </Link>
              </Button>
              {(Object.keys(catalogueLabels) as CatalogueKind[]).map((kind) => {
                const options = terms.filter(
                  (term) => term.kind === kind && term.domain_ids.includes(domain.id),
                );
                return (
                  options.length > 0 && (
                    <section key={kind}>
                      <h3 className="font-semibold">{catalogueLabels[kind]}</h3>
                      <ul className="category-dialog-options mt-2">
                        {options.map((term) => (
                          <li key={term.id}>
                            <TermLink term={term} domainId={domain.id} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                );
              })}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
