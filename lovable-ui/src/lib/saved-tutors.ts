import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeFailure } from "./api";
import { accountSessionKey } from "./session";

export const savedTutorsKey = ["saved-tutors"] as const;
export const savedTutorsForAccount = (accountId: string) => [...savedTutorsKey, accountId] as const;

/** Cookie authority is checked by the API; no identity or profile snapshots enter browser storage. */
export function useSavedTutors() {
  const [mounted, setMounted] = useState(false);
  const client = useQueryClient();
  useEffect(() => setMounted(true), []);
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: mounted,
    retry: false,
    staleTime: 0,
  });
  const accountId = mounted && session.data?.ok ? session.data.data.user.id : undefined;
  const anonymous =
    mounted &&
    session.data?.ok === false &&
    session.data.error.kind === "http" &&
    session.data.error.status === 401;
  useEffect(() => {
    if (!mounted) return;
    client.removeQueries({
      queryKey: savedTutorsKey,
      predicate: (query) => query.queryKey[1] !== accountId,
    });
  }, [accountId, mounted, client]);
  const saved = useQuery({
    queryKey: savedTutorsForAccount(accountId || "signed-out"),
    queryFn: api.savedTutors,
    enabled: !!accountId,
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
  });
  const sessionError = session.isError
    ? "Could not check your account. Please try again."
    : session.data?.ok === false && !anonymous
      ? describeFailure(session.data.error)
      : undefined;
  const error = saved.isError
    ? "Could not load your saved Tutors. Please try again."
    : saved.data?.ok === false
      ? describeFailure(saved.data.error)
      : undefined;
  return {
    accountId,
    anonymous,
    checkingAccount: !mounted || session.isPending,
    sessionError,
    items: accountId && saved.data?.ok ? saved.data.data.items : undefined,
    limit: saved.data?.ok ? saved.data.data.limit : 50,
    loading: !!accountId && saved.isPending,
    error,
    refresh: () => saved.refetch(),
    refreshSession: () => session.refetch(),
    invalidate: () =>
      accountId
        ? client.invalidateQueries({ queryKey: savedTutorsForAccount(accountId) })
        : Promise.resolve(),
  };
}
