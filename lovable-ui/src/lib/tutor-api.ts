import { createContext, useContext } from "react";
import {
  api,
  assetUrl,
  request,
  type PresenceWrite,
  type TeachingListing,
  type TeachingOffer,
  type TutorIntroduction,
  type TutorOnboardingDraft,
  type TutorPhoto,
  type TutorPhotoState,
  type TutorPresence,
  type TutorState,
} from "@/lib/api";

const tutorCalls = [
  "tutor",
  "saveTutorIntroduction",
  "tutorPublication",
  "tutorPresence",
  "saveTutorPresence",
  "tutorPhoto",
  "uploadTutorPhoto",
  "removeTutorPhoto",
  "photoPreviewUrl",
  "listings",
  "createListing",
  "editListing",
  "listingAction",
  "tutorOnboardingDraft",
  "saveTutorOnboardingDraft",
  "clearTutorOnboardingDraft",
] as const;

/**
 * The calls the Tutor wizards make about "my" Tutor profile. The Tutor's own pages use
 * the account's routes; the staff onboarding page (ADR0018) supplies the same calls
 * acting for one claimed request, so staff see and use exactly the Tutor's wizard.
 * `scope` identifies whose profile the calls reach, for cache keys.
 */
export type TutorApi = Pick<typeof api, (typeof tutorCalls)[number]> & { scope: string };

// Resolved at call time, so the account's own calls stay the single source of truth.
export const ownTutorApi = Object.assign(
  Object.fromEntries(
    tutorCalls.map((name) => [
      name,
      (...args: unknown[]) => (api[name] as (...a: unknown[]) => unknown)(...args),
    ]),
  ),
  { scope: "own" },
) as unknown as TutorApi;

export function assistedTutorApi(requestId: string): TutorApi {
  const base = "/v1/staff/tutor-onboarding/" + encodeURIComponent(requestId) + "/as-tutor";
  return {
    scope: "assist:" + requestId,
    tutor: () => request<TutorState>("GET", base + "/tutor"),
    saveTutorIntroduction: (input: TutorIntroduction) =>
      request<TutorState>("POST", base + "/tutor/introduction", input),
    tutorPublication: (expected_public_revision: number, action: "PUBLISH" | "PAUSE") =>
      request<TutorState>("POST", base + "/tutor/publication", {
        expected_public_revision,
        action,
      }),
    tutorPresence: () => request<{ presence: TutorPresence }>("GET", base + "/tutor/presence"),
    saveTutorPresence: (input: PresenceWrite) =>
      request<{ presence: TutorPresence; offers_need_review: number }>(
        "POST",
        base + "/tutor/presence",
        input,
      ),
    tutorPhoto: () => request<TutorPhotoState>("GET", base + "/tutor/photo"),
    uploadTutorPhoto: (media_type: string, data: string) =>
      request<{ photo: TutorPhoto }>("POST", base + "/tutor/photo", {
        media_type,
        data,
        public_consent: true,
      }),
    removeTutorPhoto: (id: string) =>
      request<void>("DELETE", base + "/tutor/photo/" + encodeURIComponent(id)),
    photoPreviewUrl: (id: string) => assetUrl(base + "/tutor/photo/" + encodeURIComponent(id)),
    listings: () =>
      request<
        Awaited<ReturnType<typeof api.listings>> extends { ok: true; data: infer D } ? D : never
      >("GET", base + "/listings"),
    createListing: (offer: TeachingOffer) =>
      request<{ listing: TeachingListing }>("POST", base + "/listings", offer),
    editListing: (id: string, revision: number, offer: TeachingOffer) =>
      request<{ listing: TeachingListing }>("POST", base + "/listings/" + encodeURIComponent(id), {
        revision,
        offer,
      }),
    listingAction: (
      id: string,
      revision: number,
      action: "SUBMIT" | "PUBLISH" | "PAUSE" | "RESUME" | "ARCHIVE",
    ) =>
      request<{ listing: TeachingListing }>(
        "POST",
        base +
          "/listings/" +
          encodeURIComponent(id) +
          "/actions/" +
          (action === "SUBMIT" ? "PUBLISH" : action),
        { revision },
      ),
    // Private drafts belong to the Tutor's own browser sessions; staff work straight
    // on the saved profile, so the wizard starts from it and keeps no draft.
    tutorOnboardingDraft: async () => ({ ok: true as const, status: 200, data: { draft: null } }),
    saveTutorOnboardingDraft: async (input: {
      revision: number;
      step: number;
      data: TutorOnboardingDraft["data"];
    }) => ({
      ok: true as const,
      status: 200,
      data: {
        draft: { ...input, revision: input.revision + 1, updated_at: new Date().toISOString() },
      },
    }),
    clearTutorOnboardingDraft: async () => ({ ok: true as const, status: 204, data: undefined }),
  };
}

export const TutorApiContext = createContext<TutorApi>(ownTutorApi);
export const useTutorApi = () => useContext(TutorApiContext);
