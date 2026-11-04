import type { TeachingListing } from "./api";
export const offerStatusLabels: Record<TeachingListing["status"], string> = {
  DRAFT: "Draft",
  REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  PUBLISHED: "Published",
  PAUSED: "Paused",
  SAFETY_SUSPENDED: "Restricted by staff",
};
export function focusTutorOffers(items: readonly TeachingListing[]) {
  const rank = (item: TeachingListing) =>
    item.status === "SAFETY_SUSPENDED"
      ? 0
      : item.requires_profile_review
        ? 1
        : item.status === "CHANGES_REQUESTED"
          ? 2
          : item.status === "PUBLISHED" && !item.eligible
            ? 3
            : item.status === "DRAFT"
              ? 4
              : item.status === "REVIEW"
                ? 5
                : item.status === "PAUSED"
                  ? 6
                  : 7;
  return [...items].sort((a, b) => rank(a) - rank(b));
}
export function offerAvailability(item: TeachingListing): string {
  if (item.status === "SAFETY_SUSPENDED")
    return "Staff must lift the restriction before this offer can be published.";
  if (item.requires_profile_review)
    return "Your profile needs review before this offer can be submitted.";
  if (item.status === "PUBLISHED")
    return item.eligible
      ? "Available for learners to discover."
      : "Not currently available for discovery. Check profile and Tutor Pro status.";
  if (item.status === "REVIEW")
    return "Waiting for a staff decision. This offer is not public yet.";
  if (item.status === "CHANGES_REQUESTED")
    return "Read the feedback, revise your draft and submit it again.";
  if (item.status === "PAUSED") return "Hidden from discovery until you resume an eligible offer.";
  return "Saved privately. Submit for staff review when you are ready.";
}
export function canSubmitOffer(
  item: TeachingListing,
  proActive: boolean,
  subjects: readonly string[],
) {
  return (
    proActive &&
    !item.requires_profile_review &&
    subjects.includes(item.offer.subject_id) &&
    (item.status === "DRAFT" || item.status === "CHANGES_REQUESTED")
  );
}
export function canResumeOffer(
  item: TeachingListing,
  proActive: boolean,
  subjects: readonly string[],
) {
  return (
    proActive &&
    !item.requires_profile_review &&
    subjects.includes(item.offer.subject_id) &&
    item.status === "PAUSED"
  );
}
