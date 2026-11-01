import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, UserPlus, UserX, RefreshCw } from "lucide-react";
import { api, describeFailure, type AdminMember, type StaffAccess } from "@/lib/api";
import { Field, Notice, SubmitButton, useSingleFlight } from "./account/ui";
import { Button } from "./ui/button";

export function AdminTeamManager() {
  const [access, setAccess] = useState<StaffAccess>(),
    [members, setMembers] = useState<AdminMember[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [email, setEmail] = useState(""),
    [reason, setReason] = useState(""),
    [revoke, setRevoke] = useState<AdminMember>(),
    [revokeReason, setRevokeReason] = useState("");
  const [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [fetching, setFetching] = useState(true);
  const { loading, run } = useSingleFlight();
  const request = useRef(0);
  const load = useCallback(async (next?: string) => {
    const attempt = ++request.current;
    setFetching(true);
    setError(undefined);
    const a = await api.staffAccess();
    if (attempt !== request.current) return;
    if (!a.ok) {
      setError(describeFailure(a.error));
      setAccess(undefined);
      setMembers([]);
      setFetching(false);
      return;
    }
    setAccess(a.data);
    if (!a.data.authenticated || a.data.role !== "SUPER_ADMIN") {
      setMembers([]);
      setFetching(false);
      return;
    }
    const r = await api.adminTeam(next);
    if (attempt !== request.current) return;
    if (r.ok) {
      setMembers((old) => (next ? [...old, ...r.data.admins] : r.data.admins));
      setCursor(r.data.next_cursor);
    } else {
      setError(describeFailure(r.error));
      setMembers([]);
      setCursor(null);
    }
    setFetching(false);
  }, []);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const grant = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setNotice(undefined);
      setError(undefined);
      const r = await api.grantAdmin(email.trim().toLowerCase(), reason.trim());
      if (!r.ok) {
        setError(describeFailure(r.error));
        return;
      }
      setEmail("");
      setReason("");
      await load();
      setNotice("Admin access granted. Ask them to sign in and open the staff workspace.");
    });
  };
  const remove = (e: FormEvent) => {
    e.preventDefault();
    if (!revoke) return;
    const target = revoke;
    void run(async () => {
      setNotice(undefined);
      setError(undefined);
      const r = await api.revokeAdmin(target.id, revokeReason.trim());
      if (!r.ok) {
        setError(describeFailure(r.error));
        return;
      }
      setRevoke(undefined);
      setRevokeReason("");
      await load();
      setNotice("Admin access revoked. Their staff sessions have been closed.");
    });
  };
  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {fetching && !access ? (
        <p role="status">Checking Super Admin access…</p>
      ) : !access?.authenticated ? (
        <Notice tone="info">
          Enter the{" "}
          <Link className="link" to="/staff">
            staff workspace
          </Link>{" "}
          to verify your admin access first.
        </Notice>
      ) : access.role !== "SUPER_ADMIN" ? (
        <Notice tone="info">
          Only the Super Admin can manage admin access.{" "}
          <Link className="link" to="/staff">
            Back to your review workspace
          </Link>
          .
        </Notice>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck aria-hidden className="size-6 text-coral-strong" />
              <h2 className="text-xl font-semibold">One Super Admin. A focused review team.</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Admins can review Tutor evidence, profiles, offers, portraits, Guardians, safety and
              reviews, plus handle support and privacy requests. Dashboards, finance, platform
              controls and admin delegation stay with you.
            </p>
            <p className="mt-3 text-sm">
              The Super Admin role is protected and cannot be granted or revoked here.
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserPlus aria-hidden className="size-5" />
              Grant Admin access
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              They must first create a normal website account and verify their email.
            </p>
            <form onSubmit={grant} className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label="Verified account email"
                type="email"
                autoComplete="off"
                value={email}
                required
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Field
                label="Reason for granting access"
                hint="10–240 characters; recorded in the audit trail."
                value={reason}
                minLength={10}
                maxLength={240}
                required
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="sm:col-span-2">
                <SubmitButton loading={loading} loadingText="Updating access…">
                  Grant Admin access
                </SubmitButton>
              </div>
            </form>
          </section>
          {revoke && (
            <section
              className="rounded-2xl border border-destructive bg-card p-5"
              aria-label="Confirm admin revocation"
            >
              <h2 className="font-semibold">Revoke access for {revoke.display_name}?</h2>
              <p className="mt-2 break-all text-sm">{revoke.email}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Their staff sessions close immediately. Their normal website account remains
                available.
              </p>
              <form onSubmit={remove} className="mt-4 space-y-4">
                <Field
                  label="Reason for revoking access"
                  minLength={10}
                  maxLength={240}
                  required
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                />
                <div className="flex flex-wrap gap-3">
                  <SubmitButton loading={loading} loadingText="Revoking…">
                    Confirm revoke access
                  </SubmitButton>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => {
                      setRevoke(undefined);
                      setRevokeReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </section>
          )}
          <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label="Admin team">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Admin team</h2>
              <Button variant="outline" disabled={fetching || loading} onClick={() => void load()}>
                <RefreshCw aria-hidden className="size-4" />
                Refresh team
              </Button>
            </div>
            {fetching && (
              <p role="status" className="mt-4 text-sm">
                Loading admin access…
              </p>
            )}
            <ul className="mt-4 divide-y">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-5"
                >
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">
                      {member.display_name}{" "}
                      {member.role === "SUPER_ADMIN" && (
                        <span className="ml-2 rounded-full bg-secondary px-3 py-1 text-xs">
                          Super Admin · protected
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 break-all text-sm text-muted-foreground">{member.email}</p>
                    <p className="mt-2 text-sm">
                      {member.role === "SUPER_ADMIN" ? "All admin areas" : "Review & support Admin"}{" "}
                      · <strong>{member.enabled ? "Access enabled" : "Access revoked"}</strong>
                    </p>
                  </div>
                  {member.role !== "SUPER_ADMIN" &&
                    (member.enabled ? (
                      <Button
                        variant="outline"
                        disabled={loading || fetching}
                        onClick={() => {
                          setRevoke(member);
                          setRevokeReason("");
                          setNotice(undefined);
                        }}
                      >
                        <UserX aria-hidden className="size-4" />
                        Revoke access
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={loading || fetching}
                        onClick={() => {
                          setEmail(member.email);
                          setReason("");
                          setNotice(
                            "Account email filled above. Add a reason to grant access again.",
                          );
                        }}
                      >
                        Grant access again
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
            {!members.length && !fetching && (
              <p className="mt-4 text-sm">No admin assignments on this page.</p>
            )}
            {cursor && (
              <Button
                variant="outline"
                disabled={fetching || loading}
                onClick={() => void load(cursor)}
              >
                More admins
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
