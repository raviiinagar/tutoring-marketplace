import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowUpRight, Heart, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { useLearnerDashboard } from "@/lib/learner-dashboard";
import { RequestDeadline } from "./request-deadline";

function DashboardData<T>({
  query,
  label,
  children,
}: {
  query: UseQueryResult<T, Error>;
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending)
    return (
      <p role="status" className="py-4 text-sm text-muted-foreground">
        Loading {label.toLowerCase()}…
      </p>
    );
  if (query.isError)
    return (
      <div className="space-y-3">
        <Notice tone="error">{label} could not be loaded.</Notice>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry {label.toLowerCase()}
        </Button>
      </div>
    );
  return children(query.data);
}
const panel = "min-w-0 rounded-3xl border bg-card p-5 sm:p-7";
export function LearnerDashboard() {
  const data = useLearnerDashboard(),
    navigate = useNavigate();
  useEffect(() => {
    if (data.anonymous) void navigate({ to: "/auth/signin", replace: true });
  }, [data.anonymous, navigate]);
  const user = data.user;
  if (!user)
    return (
      <AuthShell title="Your dashboard">
        {data.error ? (
          <div className="space-y-4">
            <Notice tone="error">{data.error}</Notice>
            <Button onClick={() => void data.session.refetch()}>Try again</Button>
          </div>
        ) : (
          <p role="status">
            {data.anonymous ? "Please sign in to open your dashboard." : "Loading your dashboard…"}
          </p>
        )}
      </AuthShell>
    );
  return (
    <AuthShell
      wide
      dashboard
      title={`Hello, ${user.display_name}`}
      intro="Your learning, conversations and account, together in one place."
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Button className="rounded-full" asChild>
          <Link to="/tutors">
            <Search aria-hidden className="size-4" />
            Find a Tutor
          </Link>
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => void data.refresh()}
          disabled={data.session.isFetching}
        >
          Refresh dashboard
        </Button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-5" aria-label="Your account overview">
          <section className={panel + " bg-gradient-to-b from-amber-50 to-card"}>
            <div
              aria-hidden
              className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-amber-100 font-display text-2xl font-semibold text-amber-900"
            >
              {user.display_name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </div>
            <h2 className="break-words text-xl font-semibold">{user.display_name}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-success">
              <ShieldCheck aria-hidden className="size-4" />
              {user.email_verified ? "Email verified" : "Email not verified"}
            </p>
            <Link
              to="/account/settings"
              className="link mt-5 inline-flex items-center gap-1 text-sm"
            >
              Manage your account
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </section>
          <section className={panel} aria-labelledby="pass-title">
            <h2 id="pass-title" className="text-lg font-semibold">
              Your Access Pass
            </h2>
            <div className="mt-4">
              <DashboardData query={data.access} label="Access Pass">
                {(access) => (
                  <>
                    {access.coverage ? (
                      <>
                        <p className="font-semibold">
                          {access.coverage.status === "ACTIVE"
                            ? "Active"
                            : "Ready for your first acceptance"}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {access.coverage.status === "ACTIVE"
                            ? `Valid until ${new Date(access.coverage.expires_at).toLocaleString()}`
                            : "Your 30-day access starts after the first eligible Tutor acceptance."}
                        </p>
                        {access.coverage.source === "COUPON" && (
                          <p className="mt-2 text-xs">Covered by a coupon.</p>
                        )}
                        {access.coverage.test_only && (
                          <p className="mt-2 text-xs">
                            Test access only. No real money was charged.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No current Access Pass. Browse Tutors for free, then review access when you
                        are ready to enquire.
                      </p>
                    )}
                    <p className="mt-4 text-sm">
                      <strong>{access.pending_count}</strong> of {access.pending_limit} pending
                      enquiries
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Tuition is paid separately to your Tutor.
                    </p>
                  </>
                )}
              </DashboardData>
            </div>
            <Link to="/payments" className="link mt-4 inline-block text-sm">
              View pass & payments
            </Link>
          </section>
          <section className={panel}>
            <h2 className="text-lg font-semibold">Saved Tutors</h2>
            <div className="mt-3">
              <DashboardData query={data.saved} label="Saved Tutors">
                {(saved) => (
                  <p className="text-sm text-muted-foreground">
                    {saved.items.length
                      ? `${saved.items.length} saved ${saved.items.length === 1 ? "Tutor" : "Tutors"}. Revisit your shortlist when you are ready.`
                      : "No saved Tutors yet. Tap a Tutor's heart to keep them here."}
                  </p>
                )}
              </DashboardData>
            </div>
            <Link to="/saved-tutors" className="link mt-4 inline-flex items-center gap-2 text-sm">
              <Heart aria-hidden className="size-4" />
              Open saved Tutors
            </Link>
          </section>
        </aside>
        <div className="min-w-0 space-y-6">
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Recent enquiries</h2>
              <Link to="/requests" className="link text-sm">
                View all enquiries
              </Link>
            </div>
            <div className="mt-5">
              <DashboardData query={data.requests} label="Enquiries">
                {(result) =>
                  result.requests.length ? (
                    <ul className="divide-y">
                      {result.requests.slice(0, 3).map((request) => (
                        <li key={request.id} className="py-4 first:pt-0">
                          <h3 className="break-words font-semibold">{request.offer.title}</h3>
                          <div className="mt-2 text-sm">
                            <RequestDeadline request={request} />
                          </div>
                          {request.connection_id && (
                            <Link
                              to="/connections/$connectionId"
                              params={{ connectionId: request.connection_id }}
                              className="link mt-3 inline-block text-sm"
                            >
                              Open Connection
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-2xl bg-secondary p-5">
                      <h3 className="font-semibold">Your first enquiry starts with a Tutor</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        Find a suitable teaching offer, describe your goals and review your access
                        before sending. An enquiry is not a class booking.
                      </p>
                      <Link to="/tutors" className="link mt-4 inline-block text-sm">
                        Find your next Tutor
                      </Link>
                    </div>
                  )
                }
              </DashboardData>
            </div>
          </section>
          <section className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Messages & Connections</h2>
              <Link to="/connections" className="link text-sm">
                View all Connections
              </Link>
            </div>
            <div className="mt-5">
              <DashboardData query={data.connections} label="Connections">
                {(result) =>
                  result.connections.length ? (
                    <ul className="divide-y">
                      {result.connections.slice(0, 3).map((connection) => (
                        <li
                          key={connection.id}
                          className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0"
                        >
                          <div className="min-w-0">
                            <h3 className="break-words font-semibold">{connection.offer.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {!connection.available
                                ? "Currently unavailable"
                                : connection.status === "PENDING_GRANT"
                                  ? "Access confirmation pending"
                                  : connection.unread_count === null
                                    ? "Open to check messages"
                                    : `${connection.unread_count} unread ${connection.unread_count === 1 ? "message" : "messages"}`}
                            </p>
                          </div>
                          <Link
                            to="/connections/$connectionId"
                            params={{ connectionId: connection.id }}
                            className="link text-sm"
                          >
                            Open Connection
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-2xl bg-secondary p-5">
                      <MessageCircle aria-hidden className="mb-3 size-6 text-muted-foreground" />
                      <h3 className="font-semibold">Your conversations will appear here</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        A Connection opens after a Tutor accepts and access is confirmed. Existing
                        Connections can then be used to discuss classes.
                      </p>
                      <Link to="/requests" className="link mt-4 inline-block text-sm">
                        Check your enquiries
                      </Link>
                    </div>
                  )
                }
              </DashboardData>
            </div>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Your learning tools</h2>
            <div className="mt-4">
              <DashboardData query={data.learners} label="Learner profiles">
                {(learners) => (
                  <p className="mb-4 text-sm text-muted-foreground">
                    {learners.profiles.some((p) => p.usable)
                      ? "Your Learner profile is ready for enquiries. Manage profiles for yourself or a child you are responsible for."
                      : "Set up a usable Learner profile before sending an enquiry. A child's learning is managed through a Guardian."}
                  </p>
                )}
              </DashboardData>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/learners" className="task-link">
                <strong>Learner profiles</strong>
                <span>Manage learning goals and Guardian-managed profiles.</span>
              </Link>
              <Link to="/notifications" className="task-link">
                <strong>Updates & notifications</strong>
                <span>Read your updates and manage preferences.</span>
              </Link>
              <Link to="/support" className="task-link">
                <strong>Get help</strong>
                <span>Support cases, replies and appeals.</span>
              </Link>
              <Link to="/payments/history" className="task-link">
                <strong>Receipts & payment history</strong>
                <span>Check payment and refund records.</span>
              </Link>
            </div>
          </section>
          {user.roles.includes("TUTOR") ? (
            <section className={panel}>
              <h2 className="text-xl font-semibold">Your teaching tools</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link to="/tutor" className="task-link">
                  <strong>Tutor profile</strong>
                  <span>Profile, evidence and review progress.</span>
                </Link>
                <Link to="/tutor/listings" className="task-link">
                  <strong>Teaching offers</strong>
                  <span>Create or manage your offers.</span>
                </Link>
                <Link to="/tutor/requests" className="task-link">
                  <strong>Incoming enquiries</strong>
                  <span>Respond to learners.</span>
                </Link>
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Want to teach?{" "}
              <Link to="/account/settings" hash="roles" className="link">
                Add the Tutor role in account settings
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
