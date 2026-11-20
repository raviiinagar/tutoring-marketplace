import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  api,
  describeFailure,
  type ApiFailure,
  type Catalogue,
  type StaffOnboardingRequest,
  type TutorState,
} from "@/lib/api";
import { assistedTutorApi, TutorApiContext } from "@/lib/tutor-api";
import { Notice, useSingleFlight } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { SimpleTutorSetup } from "@/components/simple-tutor-setup";
import { TutorListingsManager } from "@/components/tutor-listings-page";

type Operation = "CLAIM" | "RELEASE" | "COMPLETE" | "CANCEL" | "REOPEN";

type Status = "ACTIVE" | "COMPLETED" | "CANCELLED";
const statusLabel: Record<StaffOnboardingRequest["status"], string> = {
  OPEN: "Waiting",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
const waDigits = (number: string | null) => (number ?? "").replace(/\D/g, "");

function RequestCard({
  row,
  busy,
  onAction,
  onOpen,
}: {
  row: StaffOnboardingRequest;
  busy: boolean;
  onAction: (operation: Operation, reason?: string) => void;
  onOpen: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const active = row.status === "OPEN" || row.status === "IN_PROGRESS";
  return (
    <li className="rounded-2xl border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {row.display_name}{" "}
            <span className="text-sm font-normal text-muted-foreground">· {row.reference}</span>
          </p>
          <p className="text-sm break-all">{row.email}</p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
          {statusLabel[row.status]}
          {row.status === "IN_PROGRESS" &&
            ` · ${row.assigned_to_me ? "you" : (row.assignee_name ?? "a team member")}`}
        </span>
      </div>
      {row.whatsapp_number && (
        <p className="text-sm">
          WhatsApp:{" "}
          <a
            className="link"
            href={`https://wa.me/${waDigits(row.whatsapp_number)}`}
            target="_blank"
            rel="noreferrer"
          >
            {row.whatsapp_number}
          </a>
        </p>
      )}
      {row.note && (
        <p className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-3 text-sm">
          {row.note}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Requested {when(row.created_at)} · consent {row.consent_version}
        {row.completed_at && ` · completed ${when(row.completed_at)}`}
        {row.cancelled_at &&
          ` · cancelled by ${row.cancelled_by?.toLowerCase()} ${when(row.cancelled_at)}`}
      </p>
      {row.staff_note && <p className="text-sm">Team note: {row.staff_note}</p>}
      {active && (
        <div className="flex flex-wrap gap-2">
          {row.status === "OPEN" && (
            <Button disabled={busy} onClick={() => onAction("CLAIM")}>
              Claim
            </Button>
          )}
          {row.status === "IN_PROGRESS" && row.assigned_to_me && (
            <>
              <Button disabled={busy} onClick={onOpen}>
                Set up profile
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => onAction("RELEASE")}>
                Release
              </Button>
            </>
          )}
          {row.status === "IN_PROGRESS" && !row.assigned_to_me && (
            <Button variant="outline" disabled={busy} onClick={() => onAction("CLAIM")}>
              Take over
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => setCancelling((v) => !v)}>
            Cancel request
          </Button>
        </div>
      )}
      {row.status === "COMPLETED" && (
        // ADR0021: reopen to fix a missing or wrong ad under the Tutor's original consent.
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onAction("REOPEN")}>
            Reopen
          </Button>
        </div>
      )}
      {active && cancelling && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor={"cancel-" + row.id}>
            Reason for cancelling (shared with the team only)
          </label>
          <textarea
            id={"cancel-" + row.id}
            className="input min-h-16 w-full"
            maxLength={240}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || reason.trim().length < 10}
            onClick={() => onAction("CANCEL", reason.trim())}
          >
            Confirm cancellation
          </Button>
        </div>
      )}
    </li>
  );
}

function Workspace({
  request,
  onBack,
  onComplete,
}: {
  request: StaffOnboardingRequest;
  onBack: () => void;
  onComplete: (note?: string) => void;
}) {
  const tutorApi = useMemo(() => assistedTutorApi(request.id), [request.id]);
  const [state, setState] = useState<TutorState | null>();
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [online, setOnline] = useState<boolean>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState("");
  const load = useCallback(
    () =>
      Promise.all([tutorApi.tutor(), api.catalogue(), tutorApi.listings()]).then(([t, c, l]) => {
        if (t.ok) setState(t.data);
        else if (t.error.kind === "http" && t.error.code === "TUTOR_ROLE_REQUIRED") setState(null);
        else setError(describeFailure(t.error));
        if (c.ok) setCatalogue(c.data);
        else setError(describeFailure(c.error));
        // ADR0021: becoming a Tutor means a live ad, so the request is finished only then.
        setOnline(l.ok && l.data.listings.some((ad) => ad.status === "PUBLISHED" && ad.eligible));
      }),
    [tutorApi],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const profile = state?.profile ?? null;
  return (
    <TutorApiContext.Provider value={tutorApi}>
      <div className="space-y-6">
        <div className="rounded-2xl border bg-secondary/60 p-5 space-y-2">
          <p className="text-sm text-muted-foreground">Creating the first ad for</p>
          <p className="text-lg font-semibold">
            {request.display_name} · {request.reference}
          </p>
          <p className="text-sm break-all">{request.email}</p>
          {request.whatsapp_number && (
            <a
              className="link inline-flex items-center gap-1 text-sm"
              href={`https://wa.me/${waDigits(request.whatsapp_number)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle aria-hidden className="size-4" /> {request.whatsapp_number}
            </a>
          )}
          <Notice tone="info">
            Everything you save here changes this Tutor's real profile and ads, and is recorded
            under your name. Use only what the Tutor sent you. After uploading their photo and
            details, delete their documents from WhatsApp and email.
          </Notice>
          <Button variant="outline" onClick={onBack}>
            Back to requests
          </Button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <section className="space-y-4" aria-labelledby="assist-ad-title">
          <h2 id="assist-ad-title" className="text-lg font-semibold">
            1. The Tutor's ad
          </h2>
          {state === undefined || !catalogue || online === undefined ? (
            <p role="status">Loading the Tutor's details…</p>
          ) : !online ? (
            // The same one form the Tutor sees under "Create it myself", filled in for them.
            <SimpleTutorSetup
              catalogue={catalogue}
              profile={profile}
              tutorName={request.display_name}
              onPublished={() => void load()}
            />
          ) : (
            <>
              <Notice tone="success">
                The Tutor's ad is online. You can mark the request complete.
              </Notice>
              <details className="rounded-2xl border p-4">
                <summary className="cursor-pointer font-semibold">
                  Change the ad or add another
                </summary>
                <div className="mt-4">
                  <TutorListingsManager
                    shell={(content) => <div className="space-y-4">{content}</div>}
                  />
                </div>
              </details>
            </>
          )}
        </section>
        <section className="rounded-2xl border p-5 space-y-3" aria-labelledby="assist-done-title">
          <h2 id="assist-done-title" className="text-lg font-semibold">
            2. Finish
          </h2>
          <p className="text-sm text-muted-foreground">
            {online
              ? "Mark the request complete. The Tutor sees that the team has finished and can change anything later."
              : "Publish the Tutor's ad first. A request can be completed only when the ad is online."}
          </p>
          <label className="block text-sm font-semibold" htmlFor="assist-note">
            Team note (optional)
          </label>
          <textarea
            id="assist-note"
            className="input min-h-16 w-full"
            maxLength={240}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button disabled={!online} onClick={() => onComplete(note.trim() || undefined)}>
            Mark as complete
          </Button>
        </section>
      </div>
    </TutorApiContext.Provider>
  );
}

/** Staff console → Service → Tutor onboarding (ADR0018). */
export function TutorOnboardingOperations() {
  const [status, setStatus] = useState<Status>("ACTIVE");
  const [rows, setRows] = useState<StaffOnboardingRequest[]>();
  const [working, setWorking] = useState<StaffOnboardingRequest>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const flight = useSingleFlight();
  const fail = (failure: ApiFailure) => {
    setError(describeFailure(failure));
    if (failure.kind === "http" && (failure.status === 401 || failure.status === 403)) {
      setRows(undefined);
      setWorking(undefined);
    }
  };
  const load = (next: Status = status) =>
    flight.run(async () => {
      setError(undefined);
      const result = await api.staffOnboardingRequests(next);
      if (result.ok) setRows(result.data.requests);
      else fail(result.error);
    });
  const act = (row: StaffOnboardingRequest, operation: Operation, reason?: string) =>
    flight.run(async () => {
      setError(undefined);
      setNotice(undefined);
      const result = await api.staffOnboardingAction(row.id, operation, row.revision, reason);
      if (!result.ok) return fail(result.error);
      const updated = result.data.request;
      setRows((old) => old?.map((r) => (r.id === updated.id ? updated : r)));
      if (operation === "CLAIM" || operation === "REOPEN") setWorking(updated);
      if (operation === "COMPLETE") {
        setWorking(undefined);
        setNotice(`${updated.display_name}'s request is complete.`);
        void load();
      }
      if (operation === "CANCEL" || operation === "RELEASE") void load();
    });
  if (working)
    return (
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Workspace
          request={working}
          onBack={() => {
            setWorking(undefined);
            void load();
          }}
          onComplete={(note) => void act(working, "COMPLETE", note)}
        />
      </div>
    );
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Tutors who chose to send their details to the team. Claim a request, set up and publish the
        profile with what the Tutor sent on WhatsApp or email, then mark it complete. Opening the
        list is recorded.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {(["ACTIVE", "COMPLETED", "CANCELLED"] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? "default" : "outline"}
            aria-pressed={status === s}
            onClick={() => {
              setStatus(s);
              if (rows) void load(s);
            }}
          >
            {s === "ACTIVE" ? "Active" : s === "COMPLETED" ? "Completed" : "Cancelled"}
          </Button>
        ))}
        <Button variant="outline" disabled={flight.loading} onClick={() => void load()}>
          {rows ? "Refresh" : "Load requests"}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {rows && rows.length === 0 && <p className="text-sm">No requests here.</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              busy={flight.loading}
              onAction={(operation, reason) => void act(row, operation, reason)}
              onOpen={() => setWorking(row)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
