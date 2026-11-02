import type { Catalogue, DiscoveryFilters } from "./api";
export type DiscoveryFilterKey = keyof DiscoveryFilters;
const offerOnly = [
  "trial_kind",
  "sort",
  "domain_id",
  "level_id",
  "curriculum_id",
  "exam_id",
  "language_id",
  "rate_unit",
  "min_rate_paise",
  "max_rate_paise",
] as const;
export const hasOfferOnlyFilters = (filters: DiscoveryFilters) =>
  offerOnly.some((key) => filters[key] !== undefined && filters[key] !== "");
export function cleanDiscoveryFilters(filters: DiscoveryFilters): DiscoveryFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([key, value]) => key !== "cursor" && key !== "limit" && value !== undefined && value !== "",
    ),
  ) as DiscoveryFilters;
}
export function removeDiscoveryFilter(
  filters: DiscoveryFilters,
  key: DiscoveryFilterKey,
): DiscoveryFilters {
  const next = { ...filters };
  delete next[key];
  if (key === "rate_unit") {
    delete next.sort;
    delete next.min_rate_paise;
    delete next.max_rate_paise;
  }
  if (key === "day") delete next.at_time;
  if (key === "domain_id")
    for (const field of [
      "subject_id",
      "level_id",
      "curriculum_id",
      "exam_id",
      "language_id",
    ] as const)
      delete next[field];
  if (key === "location") delete next.country;
  return cleanDiscoveryFilters(next);
}
export function mergeTeacherSearch(
  current: DiscoveryFilters,
  selection: DiscoveryFilters,
  catalogue?: Catalogue,
): DiscoveryFilters {
  const next = { ...current };
  for (const field of ["subject_id", "exam_id", "teaching_mode", "location", "country"] as const)
    delete next[field];
  Object.assign(next, selection);
  const selected = catalogue?.terms.find(
    (t) => t.id === (selection.subject_id || selection.exam_id),
  );
  if (selected) {
    const domains = selected.domain_ids;
    if (next.domain_id && !domains.includes(next.domain_id)) delete next.domain_id;
    for (const field of ["level_id", "curriculum_id", "language_id"] as const) {
      const term = catalogue?.terms.find((t) => t.id === next[field]);
      if (term && !term.domain_ids.some((id) => domains.includes(id))) delete next[field];
    }
  }
  return cleanDiscoveryFilters(next);
}
export function validateDiscoveryDraft(filters: DiscoveryFilters): string | undefined {
  if (
    (filters.sort ||
      filters.min_rate_paise !== undefined ||
      filters.max_rate_paise !== undefined) &&
    !filters.rate_unit
  )
    return "Choose a tuition unit before comparing prices.";
  for (const key of ["min_rate_paise", "max_rate_paise"] as const) {
    const value = filters[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 100 || value > 10000000))
      return "Enter a price from INR 1 to INR 100,000.";
  }
  if (
    filters.min_rate_paise !== undefined &&
    filters.max_rate_paise !== undefined &&
    filters.min_rate_paise > filters.max_rate_paise
  )
    return "Minimum price must not exceed maximum price.";
  if (filters.at_time !== undefined && !filters.day) return "Choose a day for the preferred time.";
  return undefined;
}
export function discoveryFilterChips(
  filters: DiscoveryFilters,
  catalogue?: Catalogue,
): { key: DiscoveryFilterKey; label: string }[] {
  const chips: { key: DiscoveryFilterKey; label: string }[] = [];
  const add = (key: DiscoveryFilterKey, label: string) => {
    if (filters[key] !== undefined && filters[key] !== "") chips.push({ key, label });
  };
  const label = (id: string | undefined) =>
    catalogue?.terms.find((t) => t.id === id)?.label || id || "";
  add(
    "domain_id",
    catalogue?.domains.find((d) => d.id === filters.domain_id)?.label || filters.domain_id || "",
  );
  for (const key of ["subject_id", "exam_id", "level_id", "curriculum_id", "language_id"] as const)
    add(key, label(filters[key]));
  add("teaching_mode", filters.teaching_mode === "ONLINE" ? "Online" : "In person");
  add("location", filters.location || "");
  add("country", filters.country || "");
  add("rate_unit", filters.rate_unit === "HOUR" ? "Per hour" : "Per lesson");
  const money = (value: number | undefined) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format((value || 0) / 100);
  add("min_rate_paise", "Min " + money(filters.min_rate_paise));
  add("max_rate_paise", "Max " + money(filters.max_rate_paise));
  add("trial_kind", "Free introductory class");
  add("sort", filters.sort === "PRICE_ASC" ? "Price: low to high" : "Price: high to low");
  add("day", filters.day || "");
  add(
    "at_time",
    filters.at_time === undefined
      ? ""
      : String(Math.floor(filters.at_time / 60)).padStart(2, "0") +
          ":" +
          String(filters.at_time % 60).padStart(2, "0") +
          " IST",
  );
  add("accepting_only", "Accepting new students");
  return chips;
}
