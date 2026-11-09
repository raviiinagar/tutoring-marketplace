import { accountInitial } from "@/lib/account-photo";
import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { MessageCircle, Check, X } from "lucide-react";
import { TeachingCard } from "./teaching-card";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { useLearnerDashboard } from "@/lib/learner-dashboard";
import { AccountAvatar } from "./account-avatar";
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
export function LearnerDashboard() {
  const data = useLearnerDashboard(),
    navigate = useNavigate();
  useEffect(() => {
    if (data.anonymous) void navigate({ to: "/auth/signin", replace: true });
  }, [data.anonymous, navigate]);
  const user = data.user;
  if (!user)
    return (
      <AuthShell title="Your dashboard" reference dashboard>
        {data.error ? (
          <>
            <Notice tone="error">{data.error}</Notice>
            <Button onClick={() => void data.session.refetch()}>Try again</Button>
          </>
        ) : (
          <p role="status">Loading your dashboard...</p>
        )}
      </AuthShell>
    );
  return (
    <AuthShell title="Dashboard" reference dashboard>
      <div className="reference-dashboard-grid">
        <section className="reference-profile-card" aria-label="Your account overview">
          <Link
            to="/account/settings"
            className="reference-profile-picture"
            aria-label={`${accountInitial(user.display_name)} Manage your profile`}
          >
            <AccountAvatar
              decorative
              user={user}
              className="h-full w-full rounded-[inherit] text-5xl text-muted-foreground"
            />
          </Link>
          <h2>{user.display_name}</h2>
          <div className="reference-verification-row">
            <span>Email verified</span>
            <span
              className={user.email_verified ? "reference-verified" : "reference-unverified"}
              aria-label={user.email_verified ? "Email verified" : "Email not verified"}
            >
              {user.email_verified ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <X aria-hidden className="size-4" />
              )}
            </span>
          </div>
          <Link to="/account/settings" className="reference-subtle-link">
            Manage your account
          </Link>
        </section>
        <div className="min-w-0">
          <section className="reference-requests-card">
            <div className="reference-card-heading">
              <h2>Class Request</h2>
              <Link to="/requests" className="reference-subtle-link">
                View all
              </Link>
            </div>
            <DashboardData query={data.requests} label="Enquiries">
              {(result) =>
                result.requests.length ? (
                  <ul className="divide-y">
                    {result.requests.slice(0, 3).map((request) => (
                      <li key={request.id} className="p-6">
                        <h3 className="font-semibold break-words">{request.offer.title}</h3>
                        <div className="mt-2 text-sm">
                          <RequestDeadline request={request} />
                        </div>
                        <Link to="/requests" className="reference-subtle-link mt-3 inline-block">
                          View request
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="reference-no-requests">
                    <MessageCircle aria-hidden className="size-12 text-slate-300" />
                    <p>No requests</p>
                    <Button asChild className="reference-coral-button">
                      <Link to="/tutors">Find a tutor</Link>
                    </Button>
                  </div>
                )
              }
            </DashboardData>
          </section>
          <TeachingCard />
        </div>
      </div>
      <details className="reference-account-tools">
        <summary>Learning tools and access</summary>
        <div className="grid gap-6 pt-6 sm:grid-cols-2">
          <section>
            <h2 className="font-semibold">Your Access Pass</h2>
            <DashboardData query={data.access} label="Access Pass">
              {(access) => (
                <div className="mt-3 space-y-3 text-sm">
                  {access.coverage ? (
                    <p>
                      {access.coverage.status === "ACTIVE"
                        ? `Active until ${new Date(access.coverage.expires_at).toLocaleString()}`
                        : "Ready for your first acceptance"}
                    </p>
                  ) : (
                    <p>No current Access Pass. Browse Tutors for free.</p>
                  )}
                  <p>
                    <strong>{access.pending_count}</strong> of {access.pending_limit} pending
                    enquiries
                  </p>
                  <Link to="/payments" className="reference-subtle-link">
                    View pass and payments
                  </Link>
                </div>
              )}
            </DashboardData>
          </section>
          <section>
            <h2 className="font-semibold">Your learning</h2>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <Link to="/saved-tutors" className="reference-subtle-link">
                Saved Tutors
              </Link>
              <Link to="/learners" className="reference-subtle-link">
                Learner profiles
              </Link>
              <Link to="/notifications" className="reference-subtle-link">
                Notifications
              </Link>
              <Link to="/support" className="reference-subtle-link">
                Help
              </Link>
              <Link to="/feedback" className="reference-subtle-link">
                Send feedback
              </Link>
              <Link to="/community" className="reference-subtle-link">
                Community
              </Link>
            </div>
          </section>
        </div>
      </details>
    </AuthShell>
  );
}
