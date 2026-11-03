import { useEffect, useId, useRef, useState, type KeyboardEvent, type FormEvent } from "react";
import { Search, MapPin, Monitor, ArrowRight, BookOpen, X } from "lucide-react";
import { api, type Catalogue, type DiscoveryFilters, type LocationSuggestion } from "@/lib/api";
const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const cities = [
  "New Delhi",
  "Mumbai",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Jaipur",
  "Lucknow",
  "Ahmedabad",
];
type Choice = { label: string; value: string; id?: string; kind?: string; country?: string };
export function TeacherSearchBar({
  catalogue,
  initial = {},
  onSearch,
}: {
  catalogue?: Catalogue | undefined;
  initial?: DiscoveryFilters;
  onSearch: (filters: DiscoveryFilters) => void;
}) {
  const base = useId(),
    root = useRef<HTMLDivElement>(null),
    locationInput = useRef<HTMLInputElement>(null),
    subjectInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(""),
    [place, setPlace] = useState(""),
    [country, setCountry] = useState<string>(),
    [menu, setMenu] = useState<"subject" | "location">(),
    [active, setActive] = useState(0),
    [locationResults, setLocationResults] = useState<{
      query: string;
      locations: LocationSuggestion[];
      failed: boolean;
    }>(),
    [locationRetry, setLocationRetry] = useState(0),
    [selectedTermId, setSelectedTermId] = useState<string>(),
    [error, setError] = useState<string>(),
    [ready, setReady] = useState(false);
  const initialKey = JSON.stringify(initial);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    setSubject(
      catalogue?.terms.find((t) => t.id === (initial.subject_id || initial.exam_id))?.label || "",
    );
    setPlace(initial.teaching_mode === "ONLINE" ? "Online" : initial.location || "");
    setCountry(initial.country);
    setSelectedTermId(initial.subject_id || initial.exam_id);
  }, [initialKey, catalogue]);
  useEffect(() => {
    if (menu !== "location") return;
    let live = true;
    const timer = setTimeout(
      () =>
        void api.tutorLocations(normalize(place) === "online" ? "" : place).then((r) => {
          if (live)
            setLocationResults({
              query: place,
              locations: r.ok ? r.data.locations : [],
              failed: !r.ok,
            });
        }),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [place, menu, locationRetry]);
  const currentLocations = locationResults?.query === place ? locationResults : undefined;
  const terms = (catalogue?.terms || [])
    .filter(
      (t) =>
        t.active &&
        ["SUBJECT", "EXAM"].includes(t.kind) &&
        (!subject.trim() ||
          [t.label, ...t.aliases].some((a) => normalize(a).includes(normalize(subject)))),
    )
    .slice(0, 8);
  const subjects: Choice[] = [
    ...(!subject.trim() ? [{ label: "All subjects", value: "" }] : []),
    ...terms.map((t) => ({ label: t.label, value: t.label, id: t.id, kind: t.kind })),
  ];
  const locationsFromData: Choice[] = (currentLocations?.locations ?? []).map((p) => ({
    label: p.label,
    value: p.query,
    country: p.country,
  }));
  const cityChoices = cities
    .filter(
      (c) =>
        !place.trim() ||
        normalize(c).includes(normalize(place)) ||
        (normalize(place) === "bangalore" && c === "Bengaluru"),
    )
    .map((city) => ({ label: city + ", India", value: city, country: "India" }));
  const places: Choice[] = [
    ...(!place.trim() || normalize("Online").includes(normalize(place))
      ? [{ label: "Online · learn from anywhere", value: "Online" }]
      : []),
    ...(!place.trim() || normalize("Anywhere").includes(normalize(place))
      ? [{ label: "Anywhere", value: "" }]
      : []),
    ...locationsFromData,
    ...cityChoices.filter(
      (c) =>
        !locationsFromData.some(
          (p) => normalize(p.value) === normalize(c.value) && p.country === c.country,
        ),
    ),
  ].slice(0, 10);
  const choices = menu === "subject" ? subjects : places;
  const choose = (item: Choice) => {
    setError(undefined);
    setActive(0);
    if (menu === "subject") {
      setSubject(item.value);
      setSelectedTermId(item.id);
      setMenu("location");
      locationInput.current?.focus();
    } else {
      setPlace(item.value);
      setCountry(item.country);
      setMenu(undefined);
    }
  };
  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setMenu(undefined);
      return;
    }
    if (!menu) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(
        (i) =>
          (i + (e.key === "ArrowDown" ? 1 : -1) + choices.length) % Math.max(choices.length, 1),
      );
    } else if (e.key === "Enter" && choices[active]) {
      e.preventDefault();
      choose(choices[active]);
    } else if (e.key === "Tab") setMenu(undefined);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const term = subject.trim()
      ? (catalogue?.terms || []).find(
          (t) =>
            t.active &&
            ["SUBJECT", "EXAM"].includes(t.kind) &&
            (selectedTermId
              ? t.id === selectedTermId
              : [t.label, ...t.aliases].some((a) => normalize(a) === normalize(subject))),
        )
      : undefined;
    if (subject.trim() && !term) {
      setError("Choose a subject or exam from the suggestions.");
      setMenu("subject");
      return;
    }
    const online = normalize(place) === "online";
    const next: DiscoveryFilters = {
      ...(term ? (term.kind === "EXAM" ? { exam_id: term.id } : { subject_id: term.id }) : {}),
      ...(online
        ? { teaching_mode: "ONLINE" as const }
        : place.trim()
          ? {
              teaching_mode: "IN_PERSON" as const,
              location: place.trim(),
              ...(country ? { country } : {}),
            }
          : {}),
    };
    setMenu(undefined);
    onSearch(next);
  };
  const listId = base + "-suggestions";
  return (
    <div
      ref={root}
      className="teacher-search-shell"
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setMenu(undefined);
      }}
    >
      <form
        className="market-search location-search-form"
        onSubmit={submit}
        aria-label="Find a teacher"
      >
        <div className="teacher-search-field">
          <BookOpen aria-hidden className="size-5 shrink-0 text-coral-strong" />
          <label className="sr-only" htmlFor={base + "-subject"}>
            Subject or exam
          </label>
          <input
            ref={subjectInput}
            id={base + "-subject"}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={menu === "subject"}
            aria-controls={menu === "subject" ? listId : undefined}
            aria-activedescendant={
              menu === "subject" && choices[active] ? listId + "-" + active : undefined
            }
            maxLength={100}
            placeholder="Try “Maths”"
            value={subject}
            autoComplete="off"
            disabled={!ready || !catalogue}
            onFocus={() => {
              setMenu("subject");
              setActive(0);
            }}
            onChange={(e) => {
              setSubject(e.target.value);
              setSelectedTermId(undefined);
              setMenu("subject");
              setActive(0);
            }}
            onKeyDown={keyDown}
          />
          {subject && (
            <button
              className="teacher-search-clear"
              type="button"
              aria-label="Clear subject or exam"
              onClick={() => {
                setSubject("");
                setSelectedTermId(undefined);
                setError(undefined);
                setMenu("subject");
                setActive(0);
                subjectInput.current?.focus();
              }}
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
        <span className="teacher-search-divider" aria-hidden />
        <div className="teacher-search-field">
          <MapPin aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <label className="sr-only" htmlFor={base + "-location"}>
            Class location
          </label>
          <input
            ref={locationInput}
            id={base + "-location"}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={menu === "location"}
            aria-controls={menu === "location" ? listId : undefined}
            aria-activedescendant={
              menu === "location" && choices[active] ? listId + "-" + active : undefined
            }
            maxLength={80}
            placeholder="City, area or Online"
            value={place}
            autoComplete="off"
            disabled={!ready}
            onFocus={() => {
              setMenu("location");
              setActive(0);
            }}
            onChange={(e) => {
              setPlace(e.target.value);
              setCountry(undefined);
              setMenu("location");
              setActive(0);
            }}
            onKeyDown={keyDown}
          />
          {place && (
            <button
              className="teacher-search-clear"
              type="button"
              aria-label="Clear location"
              onClick={() => {
                setPlace("");
                setCountry(undefined);
                setError(undefined);
                setMenu("location");
                setActive(0);
                locationInput.current?.focus();
              }}
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="market-search-button inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground"
          disabled={!ready || !catalogue}
        >
          Search <ArrowRight aria-hidden className="size-4" />
        </button>
      </form>
      {menu && (
        <div className="teacher-search-suggestions">
          <p className="px-4 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {menu === "subject" ? "Subjects & exams" : "Class location"}
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label={menu === "subject" ? "Subject suggestions" : "Location suggestions"}
          >
            {choices.map((item, i) => (
              <button
                key={item.label + "-" + i}
                type="button"
                role="option"
                aria-label={
                  item.kind && subjects.filter((choice) => choice.label === item.label).length > 1
                    ? `${item.label} (${item.kind === "EXAM" ? "exam" : "subject"})`
                    : item.label
                }
                aria-selected={i === active}
                id={listId + "-" + i}
                tabIndex={-1}
                className={"teacher-search-option " + (i === active ? "is-active" : "")}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(item)}
              >
                {menu === "subject" ? (
                  <Search aria-hidden className="size-5" />
                ) : item.value === "Online" ? (
                  <Monitor aria-hidden className="size-5" />
                ) : (
                  <MapPin aria-hidden className="size-5" />
                )}
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span>{item.label}</span>
                  {item.kind && (
                    <small aria-hidden className="text-xs text-muted-foreground">
                      {item.kind === "EXAM" ? "Exam" : "Subject"}
                    </small>
                  )}
                </span>
              </button>
            ))}
          </div>
          {menu === "location" && !currentLocations && (
            <p role="status" className="px-4 py-2 text-xs text-muted-foreground">
              Loading location suggestions...
            </p>
          )}
          {menu === "location" && currentLocations?.failed && (
            <div role="status" className="px-4 py-2 text-xs text-muted-foreground">
              Location suggestions could not be loaded. You can still type a city or choose Online.{" "}
              <button
                type="button"
                className="font-semibold underline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setLocationResults(undefined);
                  setLocationRetry((value) => value + 1);
                }}
              >
                Retry locations
              </button>
            </div>
          )}
          {menu === "location" && (
            <p className="px-4 pb-2 text-xs text-muted-foreground">
              Cities and areas are search options. Results show current Tutor availability.
            </p>
          )}
          {!choices.length && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {menu === "subject"
                ? "No matching subject. Try another subject or exam."
                : "Enter a city or area to search, or choose Online."}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
