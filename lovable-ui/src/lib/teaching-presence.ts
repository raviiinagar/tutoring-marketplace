import { useQuery } from "@tanstack/react-query";
import { api, type TeachingListing, type User } from "./api";
import { accountSessionKey } from "./session";

/**
 * What an account has done on the teaching side, derived from its own ads.
 *
 * Having a teaching workspace is not the same as being visible to learners:
 * `total` counts every ad the owner has (a private draft included), while
 * `online` counts only ads that are published and currently available.
 * Archived ads are never returned by the API, so they never count.
 */
export type TeachingSummary = { total: number; online: number; drafts: number; offline: number };

export function summarizeListings(
  listings: Pick<TeachingListing, "status" | "eligible">[],
): TeachingSummary {
  let online = 0,
    drafts = 0,
    offline = 0;
  for (const ad of listings) {
    if (ad.status === "PUBLISHED" && ad.eligible) online++;
    else if (ad.status === "DRAFT" || ad.status === "REVIEW" || ad.status === "CHANGES_REQUESTED")
      drafts++;
    else offline++;
  }
  return { total: listings.length, online, drafts, offline };
}

const isTutor = (user: Pick<User, "roles"> | null | undefined) =>
  !!user && user.roles.includes("TUTOR");

export const teachingPresenceKey = ["teaching-presence"] as const;

/**
 * Reads the signed-in account from the shared session cache (it never triggers
 * its own /v1/me request) and, only for accounts that hold the Tutor role,
 * loads a small summary of their ads. Accounts without the role never call the
 * private listings endpoint. Any failure degrades to "no teaching ads", so the
 * navigation simply keeps its learner shape.
 */
export function useTeachingPresence() {
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: false,
    retry: false,
  });
  const user = session.data?.ok ? session.data.data.user : null;
  const tutor = isTutor(user);
  const ads = useQuery({
    queryKey: [...teachingPresenceKey, user?.id ?? "signed-out"],
    enabled: tutor,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const result = await api.listings();
      if (!result.ok) throw new Error("Teaching ads are unavailable.");
      return summarizeListings(result.data.listings);
    },
  });
  const summary = tutor ? (ads.data ?? null) : null;
  return {
    isTutor: tutor,
    summary,
    /** True once the owner has at least one ad of any kind, a private draft included. */
    hasAds: (summary?.total ?? 0) > 0,
    loading: tutor && ads.isPending,
  };
}

/**
 * Where to send an account right after sign-in. Anyone with at least one ad
 * lands in the teaching workspace; everyone else keeps the learner dashboard.
 * A failure to read the ads must never block sign-in, so it falls back to the
 * learner dashboard.
 */
export async function landingAfterSignIn(
  user: Pick<User, "roles">,
): Promise<"/tutor/dashboard" | "/account"> {
  if (!isTutor(user)) return "/account";
  try {
    const result = await api.listings();
    return result.ok && result.data.listings.length > 0 ? "/tutor/dashboard" : "/account";
  } catch {
    return "/account";
  }
}
