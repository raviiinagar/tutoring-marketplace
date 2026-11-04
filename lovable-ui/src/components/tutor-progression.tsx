import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Award, CheckCircle2, LockKeyhole } from "lucide-react";
import { describeFailure, type ApiResult } from "@/lib/api";
import { reputationApi, type TutorProgress } from "@/lib/tutor-reputation-api";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import { accountSessionKey } from "@/lib/session";
import { Notice } from "./account/ui";
import { Button } from "./ui/button";

export function useReputationRead<T>(
  id: string | undefined,
  part: string,
  read: () => Promise<ApiResult<T>>,
) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["tutor-reputation", id ?? "signed-out", part],
    queryFn: read,
    enabled: !!id,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  useEffect(() => {
    client.removeQueries({
      queryKey: ["tutor-reputation"],
      predicate: (q) => q.queryKey[1] !== id,
    });
  }, [client, id]);
  useEffect(() => {
    if (
      query.data?.ok === false &&
      query.data.error.kind === "http" &&
      query.data.error.status === 401
    )
      client.setQueryData(accountSessionKey, query.data);
  }, [client, query.data]);
  return query;
}
export function ProgressDetails({ progress }: { progress: TutorProgress }) {
  const current = progress.levels.find((level) => level.id === progress.level);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Current Tutor level</p>
          <p className="mt-1 text-xl font-bold">{current?.label ?? "Not yet public"}</p>
        </div>
        <Award aria-hidden className="size-9 text-amber-600" />
      </div>
      <p className="text-sm text-muted-foreground">
        Tutor levels reflect the requirements below. They do not certify teaching quality or replace
        identity review.
      </p>
      <dl
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))" }}
      >
        <div className="rounded-2xl bg-amber-50 p-4">
          <dt className="text-sm">Published recommendations</dt>
          <dd className="mt-1 text-2xl font-bold">{progress.counts.recommendations}</dd>
          <p className="text-xs text-muted-foreground">Network endorsements reviewed by staff.</p>
        </div>
        <div className="rounded-2xl bg-secondary p-4">
          <dt className="text-sm">Published student reviews</dt>
          <dd className="mt-1 text-2xl font-bold">{progress.counts.student_reviews}</dd>
          <p className="text-xs text-muted-foreground">
            From eligible Connections; separate from recommendations.
          </p>
        </div>
      </dl>
      <ol
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))" }}
        aria-label="Tutor level progression"
      >
        {progress.levels.map((level) => (
          <li
            key={level.id}
            className={`min-w-0 rounded-2xl border p-4 ${level.awarded ? "border-amber-300 bg-amber-50/60" : ""}`}
          >
            <h3 className="flex items-center gap-2 font-semibold">
              {level.awarded ? (
                <CheckCircle2 aria-hidden className="size-4 text-emerald-700" />
              ) : level.id === "SUPER_TEACHER" || level.id === "AMBASSADOR" ? (
                <LockKeyhole aria-hidden className="size-4" />
              ) : null}
              {level.label}
              {level.awarded && <span className="text-xs text-emerald-800">Current level</span>}
            </h3>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {level.requirements.map((requirement) => (
                <li key={requirement}>• {requirement}</li>
              ))}
            </ul>
            {level.blocked_reason && (
              <p className="mt-3 text-xs text-muted-foreground">{level.blocked_reason}</p>
            )}
          </li>
        ))}
      </ol>
      <details className="rounded-2xl border p-4">
        <summary className="min-h-7 cursor-pointer font-semibold">
          Evidence and eligibility details
        </summary>
        <dl className="mt-4 space-y-3">
          {Object.entries(progress.criteria).map(([name, criterion]) => (
            <div key={name}>
              <dt className="font-medium capitalize">
                {name.replaceAll("_", " ")} ·{" "}
                {criterion.status === "MET"
                  ? "Recorded"
                  : criterion.status === "NOT_MET"
                    ? "Not recorded"
                    : "Unverified"}
              </dt>
              <dd className="text-sm text-muted-foreground">{criterion.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          Higher levels are unavailable while the official criteria conflict or remain unverified.
          Purchasing Tutor Pro does not earn a badge.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <a
            className="link"
            href="https://www.superprof.co.in/help/teachers/become-a-superprof/superprof-charter/50/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official level guidance
          </a>
          <a
            className="link"
            href="https://www.superprof.co.in/gtu.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official terms
          </a>
        </div>
      </details>
    </div>
  );
}
export function TutorProgression() {
  const account = useTutorAccount();
  const id = account.user?.roles.includes("TUTOR") ? account.user.id : undefined;
  return id ? <TutorProgressionPanel id={id} /> : null;
}
/** Embed only under an account/role guard; avoids creating another session observer. */
export function TutorProgressionPanel({ id, compact = false }: { id: string; compact?: boolean }) {
  const query = useReputationRead(id, "progression", reputationApi.progression);
  return (
    <section
      aria-label="Tutor level"
      className="min-w-0 space-y-5 rounded-3xl border bg-card p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Your Tutor level</h2>
        <Link className="link text-sm" to="/tutor/evaluations">
          Manage evaluations
        </Link>
      </div>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh Tutor level
      </Button>
      {query.isPending ? (
        <p role="status">Loading Tutor level…</p>
      ) : query.isError || query.data?.ok === false ? (
        <>
          <Notice tone="error">
            {query.data?.ok === false
              ? describeFailure(query.data.error)
              : "Could not load Tutor level."}
          </Notice>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry Tutor level
          </Button>
        </>
      ) : query.data?.ok ? (
        compact ? (
          <div className="space-y-3">
            <p className="text-xl font-semibold">
                  {query.data.data.levels.find((level) => level.awarded)?.label ??
                "Not yet public"}
            </p>
            <p className="text-sm text-muted-foreground">
              {query.data.data.counts.recommendations} published recommendations. Photo and
              teaching-text requirements also apply.
            </p>
            <Link
              to="/tutor/evaluations"
              className="link inline-flex min-h-11 items-center text-sm"
            >
              View your level checklist
            </Link>
          </div>
        ) : (
          <ProgressDetails progress={query.data.data} />
        )
      ) : null}
    </section>
  );
}
