import { expect, it } from "vitest";
import type { Catalogue } from "@/lib/api";
import {
  discoveryFilterChips,
  profileDiscoveryFilters,
  discoverySearchTitle,
  hasOfferOnlyFilters,
  mergeTeacherSearch,
  removeDiscoveryFilter,
  validateDiscoveryDraft,
} from "@/lib/discovery-filter-state";
const catalogue = {
  domains: [
    { id: "school", label: "School" },
    { id: "career", label: "Career" },
  ],
  terms: [
    {
      id: "physics",
      kind: "SUBJECT",
      label: "Physics",
      aliases: [],
      domain_ids: ["school"],
      active: true,
    },
    {
      id: "coding",
      kind: "SUBJECT",
      label: "Coding",
      aliases: [],
      domain_ids: ["career"],
      active: true,
    },
    {
      id: "cbse",
      kind: "CURRICULUM",
      label: "CBSE",
      aliases: [],
      domain_ids: ["school"],
      active: true,
    },
    {
      id: "english",
      kind: "LANGUAGE",
      label: "English",
      aliases: [],
      domain_ids: ["school", "career"],
      active: true,
    },
  ],
  combinations: [],
} as Catalogue;
it("removing a unit clears unit-dependent prices, ordering and pagination", () => {
  expect(
    removeDiscoveryFilter(
      {
        rate_unit: "HOUR",
        sort: "PRICE_ASC",
        min_rate_paise: 10000,
        max_rate_paise: 60000,
        cursor: "old",
        subject_id: "physics",
      },
      "rate_unit",
    ),
  ).toEqual({ subject_id: "physics" });
  expect(
    removeDiscoveryFilter({ day: "MON", at_time: 1020, teaching_mode: "ONLINE" }, "day"),
  ).toEqual({ teaching_mode: "ONLINE" });
  expect(removeDiscoveryFilter({ location: "Kota", country: "India" }, "location")).toEqual({});
});
it("domain removal resets dependent taxonomy but preserves price and location", () => {
  expect(
    removeDiscoveryFilter(
      {
        domain_id: "school",
        subject_id: "physics",
        level_id: "class10",
        curriculum_id: "cbse",
        exam_id: "jee",
        language_id: "english",
        rate_unit: "HOUR",
        location: "Kota",
      },
      "domain_id",
    ),
  ).toEqual({ rate_unit: "HOUR", location: "Kota" });
});
it("hero edits retain refinements and remove incompatible taxonomy and old paging", () => {
  expect(
    mergeTeacherSearch(
      {
        domain_id: "school",
        subject_id: "physics",
        curriculum_id: "cbse",
        language_id: "english",
        rate_unit: "HOUR",
        max_rate_paise: 50000,
        trial_kind: "FREE",
        location: "Kota",
        country: "India",
        cursor: "old",
      },
      { subject_id: "coding", teaching_mode: "ONLINE" },
      catalogue,
    ),
  ).toEqual({
    subject_id: "coding",
    language_id: "english",
    rate_unit: "HOUR",
    max_rate_paise: 50000,
    trial_kind: "FREE",
    teaching_mode: "ONLINE",
  });
});
it("profile-compatible filters remain distinguishable from exact-offer terms", () => {
  expect(hasOfferOnlyFilters({ subject_id: "physics", location: "Kota", day: "MON" })).toBe(false);
  expect(hasOfferOnlyFilters({ trial_kind: "FREE" })).toBe(true);
  expect(hasOfferOnlyFilters({ min_rate_paise: 100 })).toBe(true);
});
it("price validation compares minor units and requires a stated unit", () => {
  expect(validateDiscoveryDraft({ max_rate_paise: 50000 })).toContain("unit");
  expect(
    validateDiscoveryDraft({ rate_unit: "HOUR", min_rate_paise: 60000, max_rate_paise: 50000 }),
  ).toContain("Minimum");
  expect(validateDiscoveryDraft({ rate_unit: "HOUR", max_rate_paise: 5000000 })).toBeUndefined();
  expect(validateDiscoveryDraft({ rate_unit: "LESSON", max_rate_paise: NaN })).toContain("price");
});
it("all applied fields have truthful readable chips, with no cursor chip", () => {
  const chips = discoveryFilterChips(
    {
      subject_id: "physics",
      country: "India",
      max_rate_paise: 50000,
      day: "MON",
      at_time: 1020,
      cursor: "old",
    },
    catalogue,
  );
  expect(chips.map((c) => c.label)).toEqual([
    "Physics",
    "India",
    "Max " +
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(500),
    "MON",
    "17:00 IST",
  ]);
});

it("public-introduction recovery keeps supported preferences and strips exact-offer constraints", () => {
  expect(
    profileDiscoveryFilters({
      subject_id: "physics",
      location: "Kota",
      country: "India",
      teaching_mode: "IN_PERSON",
      domain_id: "school",
      exam_id: "jee",
      level_id: "class10",
      sort: "PRICE_ASC",
      rate_unit: "HOUR",
      max_rate_paise: 50000,
      trial_kind: "FREE",
      cursor: "old",
    }),
  ).toEqual({
    subject_id: "physics",
    location: "Kota",
    country: "India",
    teaching_mode: "IN_PERSON",
  });
});
it("search headings describe the applied goal and mode without ranking or availability claims", () => {
  expect(discoverySearchTitle({ subject_id: "physics", location: "Kota" }, catalogue)).toBe(
    "Physics Tutors in Kota",
  );
  expect(
    discoverySearchTitle(
      { subject_id: "physics", teaching_mode: "ONLINE", location: "Kota" },
      catalogue,
    ),
  ).toBe("Physics Tutors online");
  expect(discoverySearchTitle({}, catalogue)).toBe("Find your next Tutor");
});
