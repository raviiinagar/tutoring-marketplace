import { useEffect, useId, useRef, useState, type KeyboardEvent, type FormEvent } from "react";
import { Search, MapPin, Monitor, ArrowRight, BookOpen } from "lucide-react";
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
    locationInput = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(""),
    [place, setPlace] = useState(""),
    [country, setCountry] = useState<string>(),
    [menu, setMenu] = useState<"subject" | "location">(),
    [active, setActive] = useState(0),
    [locations, setLocations] = useState<LocationSuggestion[]>([]),
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
  }, [initialKey, catalogue]);
  useEffect(() => {
    if (menu !== "location") return;
    let live = true;
    const timer = setTimeout(
      () =>
        void api.tutorLocations(normalize(place) === "online" ? "" : place).then((r) => {
          if (live) setLocations(r.ok ? r.data.locations : []);
        }),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [place, menu]);
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
  const locationsFromData: Choice[] = locations.map((p) => ({
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
            [t.label, ...t.aliases].some((a) => normalize(a) === normalize(subject)),
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
            id={base + "-subject"}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={menu === "subject"}
            aria-controls={menu === "subject" ? listId : undefined}
            aria-activedescendant={
              menu === "subject" && choices[active] ? listId + "-" + active : undefined
            }
            maxLength={100} placeholder="Try “Maths”"
            value={subject}
            autoComplete="off"
            disabled={!ready || !catalogue}
            onFocus={() => {
              setMenu("subject");
              setActive(0);
            }}
            onChange={(e) => {
              setSubject(e.target.value);
              setMenu("subject");
              setActive(0);
            }}
            onKeyDown={keyDown}
          />
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
            maxLength={80} placeholder="City, area or Online"
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
                <span>{item.label}</span>
              </button>
            ))}
          </div>
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
