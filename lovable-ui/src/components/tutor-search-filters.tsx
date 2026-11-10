import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { Catalogue, CatalogueKind, DiscoveryFilters } from "@/lib/api";
import {
  cleanDiscoveryFilters,
  discoveryFilterChips,
  removeDiscoveryFilter,
  validateDiscoveryDraft,
} from "@/lib/discovery-filter-state";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
type Panel = "mode" | "budget" | "level" | "all";
export function TutorSearchFilters({
  catalogue,
  filters,
  loading = false,
  onApply,
}: {
  catalogue?: Catalogue | undefined;
  filters: DiscoveryFilters;
  loading?: boolean;
  onApply: (filters: DiscoveryFilters) => void;
}) {
  const [panel, setPanel] = useState<Panel>(),
    [draft, setDraft] = useState<DiscoveryFilters>(filters),
    [error, setError] = useState<string>(),
    // Server-rendered controls stay disabled until React is attached, so an early
    // tap is never silently lost (the same pattern as the teacher search bar).
    [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const busy = loading || !ready;
  const trigger = useRef<HTMLButtonElement | null>(null);
  const key = JSON.stringify(filters);
  useEffect(() => {
    setDraft(filters);
    setError(undefined);
    setPanel(undefined);
  }, [key]);
  const open = (next: Panel, button: HTMLButtonElement) => {
    trigger.current = button;
    setDraft({
      ...filters,
      ...(next === "budget" && !filters.rate_unit ? { rate_unit: "HOUR" as const } : {}),
    });
    setError(undefined);
    setPanel(next);
  };
  const change = <K extends keyof DiscoveryFilters>(field: K, value: DiscoveryFilters[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validateDiscoveryDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    onApply(cleanDiscoveryFilters(draft));
    setPanel(undefined);
  };
  const chips = discoveryFilterChips(filters, catalogue);
  const termSelect = (
    text: string,
    kind: CatalogueKind,
    field: "subject_id" | "level_id" | "curriculum_id" | "exam_id" | "language_id",
  ) => (
    <label className="block text-sm font-medium">
      {text}
      <select
        className="input mt-2"
        value={draft[field] || ""}
        onChange={(e) => change(field, e.target.value || undefined)}
      >
        <option value="">Any {text.toLowerCase()}</option>
        {catalogue?.terms
          .filter(
            (t) =>
              t.active &&
              t.kind === kind &&
              (!draft.domain_id || t.domain_ids.includes(draft.domain_id)),
          )
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
      </select>
    </label>
  );
  const mode = (
    <fieldset className="space-y-3">
      <legend className="mb-3 font-semibold">Type of class</legend>
      {[
        ["", "Online + in person"],
        ["ONLINE", "Online"],
        ["IN_PERSON", "In person"],
      ].map(([value, label]) => (
        <label key={value} className="flex items-center gap-3 text-sm">
          <input
            type="radio"
            name="class-mode"
            checked={(draft.teaching_mode || "") === value}
            onChange={() =>
              change("teaching_mode", (value as DiscoveryFilters["teaching_mode"]) || undefined)
            }
          />
          {label}
        </label>
      ))}
      <label className="block text-sm font-medium">
        City or area
        <input
          className="input mt-2"
          maxLength={80}
          value={draft.location || ""}
          placeholder="e.g. Kota or Rohini, New Delhi"
          onChange={(e) =>
            setDraft((v) => ({ ...v, location: e.target.value || undefined, country: undefined }))
          }
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Search a Tutor's stated city or area. Exact distance is not calculated.
      </p>
    </fieldset>
  );
  const price = (field: "min_rate_paise" | "max_rate_paise", label: string) => (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="input mt-2"
        type="number"
        min={1}
        max={100000}
        step="0.01"
        disabled={!draft.rate_unit}
        value={draft[field] === undefined ? "" : draft[field]! / 100}
        onChange={(e) =>
          change(field, e.target.value ? Math.round(Number(e.target.value) * 100) : undefined)
        }
      />
    </label>
  );
  const outsideSlider = draft.max_rate_paise !== undefined && draft.max_rate_paise > 500000;
  const budget = (
    <fieldset className="space-y-4">
      <legend className="mb-3 font-semibold">Tuition budget</legend>
      <label className="block text-sm font-medium">
        Tuition unit
        <select
          className="input mt-2"
          value={draft.rate_unit || ""}
          onChange={(e) =>
            setDraft((v) => ({
              ...v,
              rate_unit: (e.target.value as DiscoveryFilters["rate_unit"]) || undefined,
              min_rate_paise: undefined,
              max_rate_paise: undefined,
              ...(!e.target.value ? { sort: undefined } : {}),
            }))
          }
        >
          <option value="">All units</option>
          <option value="HOUR">Per hour</option>
          <option value="LESSON">Per lesson</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Maximum budget slider (INR)
        <input
          className="mt-3 w-full accent-primary"
          type="range"
          min={1}
          max={5000}
          step={1}
          disabled={!draft.rate_unit || outsideSlider}
          aria-valuetext={
            draft.max_rate_paise === undefined
              ? "No maximum applied"
              : "INR " + draft.max_rate_paise / 100
          }
          value={outsideSlider ? 5000 : (draft.max_rate_paise ?? 500000) / 100}
          onChange={(e) => change("max_rate_paise", Number(e.target.value) * 100)}
        />
      </label>
      <output className="block text-sm font-semibold" aria-live="polite">
        {draft.max_rate_paise === undefined
          ? "No maximum applied"
          : "Maximum INR " +
            new Intl.NumberFormat("en-IN").format(draft.max_rate_paise / 100) +
            (draft.rate_unit === "LESSON" ? " / lesson" : " / hour")}
      </output>
      <p className="text-xs text-muted-foreground">
        Quick slider: INR 1-5,000.{" "}
        {outsideSlider
          ? "Your higher maximum is preserved; edit it in the number field."
          : draft.max_rate_paise === undefined
            ? "No maximum is applied yet."
            : "Use the fields below for an exact budget."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {price("min_rate_paise", "Min price (INR)")}
        {price("max_rate_paise", "Max price (INR)")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.trial_kind === "FREE"}
          onChange={(e) => change("trial_kind", e.target.checked ? "FREE" : undefined)}
        />
        Free introductory class offered
      </label>
      <p className="text-xs text-muted-foreground">
        A free class is offered by the Tutor; check its duration. The platform Access Pass is
        separate. Hourly and per-lesson prices are compared separately.
      </p>
    </fieldset>
  );
  const level = (
    <div className="space-y-4">
      <h3 className="font-semibold">Learning level</h3>
      {termSelect("Learner Level", "LEVEL", "level_id")}
      {termSelect("Curriculum", "CURRICULUM", "curriculum_id")}
    </div>
  );
  return (
    <section className="tutor-search-filters space-y-4" aria-label="Search filters">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["mode", "Type of class"],
            ["budget", "Budget"],
            ["level", "Level"],
            ["all", "More filters"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={(event) => open(id, event.currentTarget)}
            disabled={busy}
          >
            {id === "all" && <SlidersHorizontal aria-hidden className="size-4" />}
            {label}
            <ChevronDown aria-hidden className="size-4" />
          </Button>
        ))}
        <label className="flex w-full items-center gap-2 text-sm sm:ml-auto sm:w-auto">
          Sort offers
          <select
            className="input w-auto"
            aria-label="Sort teaching offers"
            value={filters.sort || ""}
            disabled={busy}
            onChange={(e) =>
              onApply(
                cleanDiscoveryFilters({
                  ...filters,
                  sort: (e.target.value as DiscoveryFilters["sort"]) || undefined,
                  ...(e.target.value && !filters.rate_unit ? { rate_unit: "HOUR" as const } : {}),
                }),
              )
            }
          >
            <option value="">Default order</option>
            <option value="PRICE_ASC">Price: low to high</option>
            <option value="PRICE_DESC">Price: high to low</option>
          </select>
        </label>
      </div>
      {filters.sort && filters.rate_unit && (
        <p role="status" className="text-xs text-muted-foreground">
          {filters.rate_unit === "HOUR" ? "Hourly" : "Per-lesson"} teaching offers, price{" "}
          {filters.sort === "PRICE_ASC" ? "low to high" : "high to low"}. Public introduction rates
          are shown separately when offer-only filters are cleared.
        </p>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1.5 text-xs"
              aria-label={"Remove " + chip.label}
              disabled={busy}
              onClick={() => onApply(removeDiscoveryFilter(filters, chip.key))}
            >
              {chip.label}
              <X aria-hidden className="size-3" />
            </button>
          ))}
          <button
            type="button"
            className="px-2 py-1 text-sm underline"
            disabled={busy}
            onClick={() => onApply({})}
          >
            Clear all
          </button>
        </div>
      )}
      <Dialog
        open={!!panel}
        onOpenChange={(value) => {
          if (!value) setPanel(undefined);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger.current?.isConnected) trigger.current.focus();
          }}
          className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle>
              {panel === "mode"
                ? "Type of class"
                : panel === "budget"
                  ? "Tuition budget"
                  : panel === "level"
                    ? "Learning level"
                    : "All search filters"}
            </DialogTitle>
            <DialogDescription>
              Refine available teaching offers. Changes apply when you select Apply filters.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-6" onSubmit={submit}>
            {panel === "mode" ? (
              mode
            ) : panel === "budget" ? (
              budget
            ) : panel === "level" ? (
              level
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Learning Domain
                    <select
                      className="input mt-2"
                      value={draft.domain_id || ""}
                      onChange={(e) =>
                        setDraft((v) => ({
                          ...removeDiscoveryFilter(v, "domain_id"),
                          domain_id: e.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">All learning domains</option>
                      {catalogue?.domains.map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {termSelect("Subject", "SUBJECT", "subject_id")}
                </div>
                {mode}
                {budget}
                {level}
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer font-semibold">
                    More learning preferences
                  </summary>
                  <div className="mt-4 space-y-4">
                    {termSelect("Exam Track", "EXAM", "exam_id")}
                    {termSelect("Teaching Language", "LANGUAGE", "language_id")}
                    <label className="block text-sm font-medium">
                      Preferred day
                      <select
                        className="input mt-2"
                        value={draft.day || ""}
                        onChange={(e) =>
                          setDraft((v) => ({
                            ...v,
                            day: (e.target.value as DiscoveryFilters["day"]) || undefined,
                            ...(!e.target.value ? { at_time: undefined } : {}),
                          }))
                        }
                      >
                        <option value="">Any day</option>
                        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
                          <option value={d} key={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      Preferred time (IST)
                      <input
                        className="input mt-2"
                        type="time"
                        disabled={!draft.day}
                        value={
                          draft.at_time === undefined
                            ? ""
                            : String(Math.floor(draft.at_time / 60)).padStart(2, "0") +
                              ":" +
                              String(draft.at_time % 60).padStart(2, "0")
                        }
                        onChange={(e) =>
                          change(
                            "at_time",
                            e.target.value
                              ? Number(e.target.value.slice(0, 2)) * 60 +
                                  Number(e.target.value.slice(3))
                              : undefined,
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.accepting_only === "true"}
                        onChange={(e) =>
                          change("accepting_only", e.target.checked ? "true" : undefined)
                        }
                      />
                      Accepting new students only
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Weekly teaching hours are declared preferences, not reserved class slots.
                    </p>
                  </div>
                </details>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background pt-4">
              <Button variant="outline" type="button" onClick={() => setPanel(undefined)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Apply filters
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
