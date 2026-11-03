import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeFailure, type ApiFailure, type ApiResult } from "./api";
import { accountSessionKey } from "./session";

const dashboardKey = ["learner-dashboard"] as const;
class DashboardLoadError extends Error {
  readonly unauthorized: boolean;
  constructor(failure: ApiFailure) {
    super(describeFailure(failure));
    this.unauthorized = failure.kind === "http" && failure.status === 401;
  }
}
function usePrivateDashboardData<T>(
  accountId: string | undefined,
  part: string,
  read: () => Promise<ApiResult<T>>,
) {
  return useQuery({
    queryKey: [...dashboardKey, accountId ?? "signed-out", part],
    enabled: !!accountId,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const result = await read();
      if (!result.ok) throw new DashboardLoadError(result.error);
      return result.data;
    },
  });
}
export function useLearnerDashboard() {
  const client = useQueryClient(),
    [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: mounted,
    retry: false,
    staleTime: 0,
  });
  const user = mounted && !session.isError && session.data?.ok ? session.data.data.user : undefined;
  const accountId = user?.id;
  const requests = usePrivateDashboardData(accountId, "requests", () => api.contactRequests());
  const connections = usePrivateDashboardData(accountId, "connections", () => api.connections());
  const access = usePrivateDashboardData(accountId, "access", api.requestAccess);
  const saved = usePrivateDashboardData(accountId, "saved", api.savedTutors);
  const learners = usePrivateDashboardData(accountId, "learners", api.learners);
  const expired = [requests, connections, access, saved, learners].some(
    (query) => query.error instanceof DashboardLoadError && query.error.unauthorized,
  );
  useEffect(() => {
    client.removeQueries({
      queryKey: dashboardKey,
      predicate: (query) => query.queryKey[1] !== accountId,
    });
  }, [accountId, client]);
  useEffect(() => {
    if (expired)
      client.setQueryData(accountSessionKey, {
        ok: false,
        error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Please sign in." },
      });
  }, [expired, client]);
  const anonymous =
    session.data?.ok === false &&
    session.data.error.kind === "http" &&
    session.data.error.status === 401;
  const error = session.isError
    ? "Could not check your account. Please try again."
    : session.data?.ok === false && !anonymous
      ? describeFailure(session.data.error)
      : undefined;
  const refresh = async () => {
    const checked = await session.refetch();
    if (checked.data?.ok && checked.data.data.user.id === accountId)
      await Promise.allSettled([
        requests.refetch(),
        connections.refetch(),
        access.refetch(),
        saved.refetch(),
        learners.refetch(),
      ]);
  };
  return {
    user,
    anonymous,
    error,
    checking: !mounted || session.isPending,
    session,
    requests,
    connections,
    access,
    saved,
    learners,
    refresh,
  };
}
