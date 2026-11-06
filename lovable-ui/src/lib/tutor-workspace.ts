import type { TeachingListing, TutorPhoto } from "./api";
export function hasPublicationPhoto(photo: TutorPhoto | null | undefined) {
  return (
    !!photo &&
    photo.scan_status === "CLEAN" &&
    (photo.status === "APPROVED" || (photo.status === "PENDING" && photo.self_published === true))
  );
}
export const offerStatusLabels: Record<TeachingListing["status"], string> = {
  DRAFT: "Draft",
  REVIEW: "Saved ad",
  CHANGES_REQUESTED: "Changes requested",
  PUBLISHED: "Online",
  PAUSED: "Offline",
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
    return "Your profile changed. Update the ad before publishing it again.";
  if (item.status === "PUBLISHED")
    return item.eligible
      ? "Students can discover your ad and send enquiries."
      : "Your ad is currently unavailable. Check your profile, teaching preferences and any staff restrictions.";
  if (item.status === "REVIEW")
    return "This saved ad is not online. Check its details and publish when ready.";
  if (item.status === "CHANGES_REQUESTED")
    return "Check the saved feedback and update your ad. Existing staff restrictions still apply.";
  if (item.status === "PAUSED") return "Hidden from discovery until you resume an eligible offer.";
  return "Saved privately. Publish your ad when you are ready.";
}
export function canPublishAd(item: TeachingListing, subjects: readonly string[]) {
  return (
    !item.publication_restricted &&
    !item.requires_profile_review &&
    subjects.includes(item.offer.subject_id) &&
    ["DRAFT", "REVIEW", "CHANGES_REQUESTED"].includes(item.status)
  );
}
export function canSubmitOffer(
  item: TeachingListing,
  _proActive: boolean,
  subjects: readonly string[],
) {
  return canPublishAd(item, subjects);
}
export function canResumeOffer(
  item: TeachingListing,
  _proActive: boolean,
  subjects: readonly string[],
) {
  return (
    !item.publication_restricted &&
    !item.requires_profile_review &&
    subjects.includes(item.offer.subject_id) &&
    item.status === "PAUSED"
  );
}
