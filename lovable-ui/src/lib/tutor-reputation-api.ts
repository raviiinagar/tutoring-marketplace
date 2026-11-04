import { request } from "./api";

export type ReputationLevel = "NEW" | "EXPERIENCED" | "SUPER_TEACHER" | "AMBASSADOR";
export type ReputationCriterion = { status: "MET" | "NOT_MET" | "UNVERIFIED"; detail: string };
export type TutorProgress = {
  policy_version: string;
  level: ReputationLevel | null;
  public_eligible: boolean;
  counts: {
    recommendations: number;
    student_reviews: number;
    positive_student_reviews: null;
    ratings_four_or_five: number;
  };
  response_facts: { decisions: number; mean_response_seconds: number | null; note: string };
  criteria: Record<
    "photo" | "profile" | "identity" | "diploma" | "response_time" | "interview",
    ReputationCriterion
  >;
  levels: {
    id: ReputationLevel;
    label: string;
    awarded: boolean;
    requirements: string[];
    blocked_reason: string | null;
  }[];
  policy_conflicts: { code: string; help?: string; terms?: string; detail?: string }[];
  sources: string[];
};
export type RecommendationStatus = "PENDING" | "PUBLISHED" | "REJECTED" | "WITHDRAWN";
export type RecommendationRelationship = "FORMER_STUDENT" | "COLLEAGUE" | "FAMILY" | "OTHER";
export type Recommendation = {
  id: string;
  relationship: RecommendationRelationship;
  status: RecommendationStatus;
  revision: number;
  review_reason?: string | null;
  created_at: string;
  updated_at: string;
};
export type AuthoredRecommendation = Recommendation & { tutor_public_id: string; text: string };
export type StaffRecommendation = Recommendation & {
  tutor_id: string;
  author_id: string;
  tutor_display_name: string;
  author_display_name: string;
  text: string;
};
export const reputationApi = {
  progression: () => request<TutorProgress>("GET", "/v1/me/tutor/progression"),
  recommendations: () =>
    request<{ recommendations: Recommendation[] }>("GET", "/v1/me/tutor/recommendations"),
  authored: () =>
    request<{ recommendations: AuthoredRecommendation[] }>("GET", "/v1/me/recommendations"),
  publicBadge: (id: string) =>
    request<{
      badge: ReputationLevel | null;
      label: string | null;
      recommendations: number;
      meaning: string;
      published_recommendations?: {
        id: string;
        author_display_name: string;
        relationship: string;
        text: string;
      }[];
    }>("GET", "/v1/tutor-profiles/" + encodeURIComponent(id) + "/progression"),
  submit: (
    id: string,
    input: { relationship: RecommendationRelationship; text: string; interaction_attested: true },
  ) =>
    request<{ recommendation: Pick<Recommendation, "id" | "status" | "revision"> }>(
      "POST",
      "/v1/tutors/" + encodeURIComponent(id) + "/recommendations",
      input,
    ),
  withdraw: (id: string) =>
    request<void>("DELETE", "/v1/me/recommendations/" + encodeURIComponent(id)),
  diploma: (evidence_id: string) =>
    request<TutorProgress>("POST", "/v1/me/tutor/progression/diploma", { evidence_id }),
  queue: (reason: string) =>
    request<{ recommendations: StaffRecommendation[]; policy: string }>(
      "GET",
      "/v1/staff/tutor-recommendations?" + new URLSearchParams({ reason }),
    ),
  decide: (
    id: string,
    input: { revision: number; outcome: "PUBLISH" | "REJECT" | "REMOVE"; reason: string },
  ) =>
    request<{ recommendation: Pick<Recommendation, "id" | "status" | "revision"> }>(
      "POST",
      "/v1/staff/tutor-recommendations/" + encodeURIComponent(id) + "/decisions",
      input,
    ),
};
