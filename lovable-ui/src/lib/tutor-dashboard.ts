import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeFailure, type ApiResult } from "./api";
import { accountSessionKey } from "./session";
const key = ["tutor-dashboard"] as const;
class TutorDataError extends Error {
  constructor(
    message: string,
    readonly unauthorized = false,
  ) {
    super(message);
  }
}
export function useTutorAccount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: mounted,
    retry: false,
    staleTime: 0,
  });
  const user = mounted && !session.isError && session.data?.ok ? session.data.data.user : undefined;
  const anonymous =
    session.data?.ok === false &&
    session.data.error.kind === "http" &&
    session.data.error.status === 401;
  const error = session.isError
    ? "Could not check your account."
    : session.data?.ok === false && !anonymous
      ? describeFailure(session.data.error)
      : undefined;
  return { session, user, anonymous, error };
}
function useTutorData<T>(id: string | undefined, part: string, read: () => Promise<ApiResult<T>>) {
  return useQuery({
    queryKey: [...key, id ?? "signed-out", part],
    enabled: !!id,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const result = await read();
      if (!result.ok)
        throw new TutorDataError(
          describeFailure(result.error),
          result.error.kind === "http" && result.error.status === 401,
        );
      return result.data;
    },
  });
}
export function useTutorDashboard() {
  const account = useTutorAccount(),
    client = useQueryClient();
  const id = account.user?.roles.includes("TUTOR") ? account.user.id : undefined;
  const profile = useTutorData(id, "profile", api.tutor),
    offers = useTutorData(id, "offers", api.listings),
    pro = useTutorData(id, "pro", api.tutorPro),
    requests = useTutorData(id, "requests", () => api.tutorRequests());
  const expired = [profile, offers, pro, requests].some(
    (q) => q.error instanceof TutorDataError && q.error.unauthorized,
  );
  useEffect(() => {
    client.removeQueries({ queryKey: key, predicate: (q) => q.queryKey[1] !== id });
  }, [id, client]);
  useEffect(() => {
    if (expired)
      client.setQueryData(accountSessionKey, {
        ok: false,
        error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Please sign in." },
      });
  }, [expired, client]);
  const refresh = async () => {
    const checked = await account.session.refetch();
    if (checked.data?.ok && checked.data.data.user.id === id)
      await Promise.allSettled([
        profile.refetch(),
        offers.refetch(),
        pro.refetch(),
        requests.refetch(),
      ]);
  };
  return { ...account, profile, offers, pro, requests, refresh };
}
