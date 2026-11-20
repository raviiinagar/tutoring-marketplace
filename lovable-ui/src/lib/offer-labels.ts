import type { TeachingOffer } from "./api";

/** The catalogue term behind every typed subject (ADR0022). Its name lives on the ad. */
export const OTHER_SUBJECT_ID = "subject-other";

export type TeachingMode = TeachingOffer["teaching_mode"];

export const teachingModeLabel = (mode: TeachingMode | undefined) =>
  mode === "BOTH" ? "Online and in person" : mode === "IN_PERSON" ? "In person" : "Online";

/** True when the ad has in-person classes, so a public city applies. */
export const teachesInPerson = (mode: TeachingMode | undefined) =>
  mode === "IN_PERSON" || mode === "BOTH";

/** The subject name to show for an ad: the typed name for "Other", otherwise the catalogue label. */
export function offerSubjectLabel(
  offer: Pick<TeachingOffer, "subject_id" | "custom_subject">,
  label: (id: string) => string,
) {
  return offer.subject_id === OTHER_SUBJECT_ID && offer.custom_subject
    ? offer.custom_subject
    : label(offer.subject_id);
}
