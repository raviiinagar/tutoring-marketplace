import { Button } from "@/components/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, describeFailure, type User, type AccountSession } from "@/lib/api";
import { AuthShell, Notice, useSingleFlight } from "@/components/account/ui";
import { useQueryClient } from "@tanstack/react-query";
import { accountSessionKey } from "@/lib/session";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Your account — Tutor Marketplace" },
      { name: "description", content: "Your private Tutor Marketplace account." },
      { property: "og:title", content: "Your account — Tutor Marketplace" },
      { property: "og:description", content: "Your private Tutor Marketplace account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Account,
});

function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [signOutError, setSignOutError] = useState<string>();
  const signOut = useSingleFlight();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [securityError, setSecurityError] = useState<string>();
  const security = useSingleFlight();
  const [hasStaff, setHasStaff] = useState(false);

  const load = useCallback(async () => {
    setLoadError(undefined);
    const res = await api.me();
    if (res.ok) {
      setUser(res.data.user);
      const staff = await api.staffAccess();
      setHasStaff(staff.ok);
      const listed = await api.sessions();
      if (listed.ok) setSessions(listed.data.sessions);
      else if (listed.error.kind === "http" && listed.error.status === 401)
        navigate({ to: "/auth/signin", replace: true });
      else setSecurityError(describeFailure(listed.error));
    } else if (res.error.kind === "http" && res.error.status === 401)
      navigate({ to: "/auth/signin", replace: true });
    else setLoadError(describeFailure(res.error));
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);
  const toggleRole = (role: User["roles"][number]) =>
    security.run(async () => {
      if (!user) return;
      setSecurityError(undefined);
      const roles = user.roles.includes(role)
        ? user.roles.filter((value) => value !== role)
        : [...user.roles, role];
      const previous = user;
      setUser({ ...user, roles });
      const result = await api.changeRoles(roles);
      if (result.ok) setUser(result.data.user);
      else {
        setUser(previous);
        if (result.error.kind === "http" && result.error.status === 401)
          navigate({ to: "/auth/signin", replace: true });
        else setSecurityError(describeFailure(result.error));
      }
    });
  const revoke = (id?: string) =>
    security.run(async () => {
      setSecurityError(undefined);
      const result = id ? await api.revokeSession(id) : await api.revokeOthers();
      if (result.ok) await load();
      else if (result.error.kind === "http" && result.error.status === 401)
        navigate({ to: "/auth/signin", replace: true });
      else setSecurityError(describeFailure(result.error));
    });

  const onSignOut = () =>
    signOut.run(async () => {
      setSignOutError(undefined);
      const res = await api.signOut();
      if (res.ok) {
        await queryClient.cancelQueries({ queryKey: accountSessionKey });
        queryClient.setQueryData(accountSessionKey, {
          ok: false,
          error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Please sign in." },
        });
        setUser(null);
        navigate({ to: "/auth/signin", replace: true });
      } else setSignOutError(describeFailure(res.error));
    });

  if (!user)
    return (
      <AuthShell title="Your account">
        {loadError ? (
          <div className="space-y-5">
            <Notice tone="error">{loadError}</Notice>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground">
            Loading your account…
          </p>
        )}
      </AuthShell>
    );

  return (
    <AuthShell
      wide
      title={`Hello, ${user.display_name}`}
      intro="Choose what you want to do. Your learning and teaching tools are all in one account."
    >
      <dl className="divide-y rounded-xl border">
        <Row label="Name" value={user.display_name} />
        <Row label="Email" value={user.email} />
        <Row label="Email status" value={user.email_verified ? "Verified" : "Not verified"} />
      </dl>
      <section className="mt-7 space-y-3">
        <h2 className="text-lg font-semibold">Learning</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/tutors" className="task-link">
            <strong>Find a Tutor</strong>
            <span>Browse subjects, prices and available teaching offers.</span>
          </Link>
          {user.roles.includes("LEARNER") && (
            <Link to="/learners" className="task-link">
              <strong>Manage Learner profiles</strong>
              <span>Save who is learning and what they need help with.</span>
            </Link>
          )}
          <Link to="/requests" className="task-link">
            <strong>View my Contact Requests</strong>
            <span>Track enquiries and Tutor responses.</span>
          </Link>
          <Link to="/connections" className="task-link">
            <strong>View my Connections</strong>
            <span>Open your accepted connections and messages.</span>
          </Link>
        </div>
      </section>
      {user.roles.includes("TUTOR") && (
        <section className="mt-7 space-y-3">
          <h2 className="text-lg font-semibold">Teaching</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/tutor" className="task-link">
              <strong>Manage Tutor profile and evidence</strong>
              <span>See saved details, uploaded documents and review progress.</span>
            </Link>
            <Link to="/tutor/listings" className="task-link">
              <strong>Manage teaching offers</strong>
              <span>Create an offer or check its publication status.</span>
            </Link>
            <Link to="/tutor/requests" className="task-link">
              <strong>Incoming Tutor enquiries</strong>
              <span>Read and respond to learners who want to connect.</span>
            </Link>
          </div>
        </section>
      )}
      <section className="mt-7 space-y-3">
        <h2 className="text-lg font-semibold">Payments</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/payments" className="task-link">
            <strong>Access Pass payment</strong>
            <span>
              Check pass access and payment status. Tuition is paid separately to your Tutor.
            </span>
          </Link>
          <Link to="/payments/history" className="task-link">
            <strong>Payment history and receipts</strong>
            <span>Track charges, refunds and downloadable receipts.</span>
          </Link>
        </div>
      </section>
      <section className="mt-7 space-y-3">
        <h2 className="text-lg font-semibold">Help and preferences</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/support" className="task-link">
            <strong>Support cases and appeals</strong>
            <span>Ask for help and track replies.</span>
          </Link>
          <Link to="/notifications" className="task-link">
            <strong>Notification preferences and updates</strong>
            <span>Read updates and choose your email preferences.</span>
          </Link>
          <Link to="/reviews" className="task-link">
            <strong>My reviews and moderation outcomes</strong>
            <span>See submitted feedback and review decisions.</span>
          </Link>
          <Link to="/safety" className="task-link">
            <strong>Safety and reports</strong>
            <span>Report a concern or manage blocks.</span>
          </Link>
          <Link to="/privacy" className="task-link">
            <strong>Your data and privacy</strong>
            <span>Request a data export or manage privacy requests.</span>
          </Link>
        </div>
      </section>
      {hasStaff && (
        <Link to="/staff" className="link mt-5 inline-block">
          Open admin dashboard
        </Link>
      )}
      <section className="mt-6 space-y-3" aria-labelledby="roles-title">
        <h2 id="roles-title" className="font-semibold">
          How you use your account
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose one or both roles. Tutor listings require approval before publication.
        </p>
        {(["LEARNER", "TUTOR"] as const).map((role) => (
          <label key={role} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={user.roles.includes(role)}
              disabled={security.loading || (user.roles.length === 1 && user.roles.includes(role))}
              onChange={() => void toggleRole(role)}
            />
            {role === "LEARNER" ? "Learner" : "Tutor"}
          </label>
        ))}
      </section>
      <section className="mt-6 space-y-3" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="font-semibold">
          Active sessions
        </h2>
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="rounded-xl border p-3">
              <p>{session.current ? "This session" : "Other session"}</p>
              <p className="text-sm text-muted-foreground">
                Signed in {new Date(session.created_at).toLocaleString()}. Expires{" "}
                {new Date(session.expires_at).toLocaleString()}.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                disabled={security.loading}
                onClick={() => void revoke(session.id)}
              >
                {session.current ? "Sign out this session" : "Revoke session"}
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          disabled={security.loading || !sessions.some((session) => !session.current)}
          onClick={() => void revoke()}
        >
          Sign out other sessions
        </Button>
      </section>
      {securityError && (
        <div className="mt-4">
          <Notice tone="error">{securityError}</Notice>
        </div>
      )}
      {signOutError && (
        <div className="mt-4">
          <Notice tone="error">{signOutError}</Notice>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="mt-6 min-h-12 w-full"
        onClick={onSignOut}
        disabled={signOut.loading}
      >
        {signOut.loading ? "Signing out…" : "Sign out"}
      </Button>
    </AuthShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value}</dd>
    </div>
  );
}
