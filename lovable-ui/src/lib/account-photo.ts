import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api, type ApiResult, type TutorPhotoState, type User } from "./api";
import { accountSessionKey } from "./session";

export const accountInitial = (name: string) => [...name.trim()][0]?.toUpperCase() || "?";

export const accountPhotoKey = (id: string) => ["account-photo", id] as const;

/** Private owner preview, independent of public profile/ad eligibility. */
export function useAccountPhoto(user: User | null | undefined) {
  const session = useQuery({ queryKey: accountSessionKey, queryFn: api.me, enabled: false });
  const allowed =
    !!user?.roles.includes("TUTOR") &&
    (!session.data || (session.data.ok && session.data.data.user.id === user.id));
  const query = useQuery({
    queryKey: accountPhotoKey(user?.id ?? "signed-out"),
    enabled: allowed,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: "always",
    gcTime: 0,
    queryFn: async () => {
      const result = await api.tutorPhoto();
      if (result.ok) return result.data;
      if (result.error.kind === "http" && [401, 403, 404, 409].includes(result.error.status))
        return null;
      throw new Error("Could not load your profile photo.");
    },
  });
  return { ...query, data: allowed ? query.data : undefined };
}

/** Ignore a completed mutation if its owner has signed out or switched accounts. */
export function updateAccountPhoto(client: QueryClient, id: string, state: TutorPhotoState) {
  const session = client.getQueryData<ApiResult<{ user: User }>>(accountSessionKey);
  if (session?.ok && session.data.user.id === id) client.setQueryData(accountPhotoKey(id), state);
}
