import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { AuthShell, Notice } from "./account/ui";
import { Button } from "./ui/button";
import { useTutorDashboard } from "@/lib/tutor-dashboard";
import { focusTutorOffers, offerAvailability, offerStatusLabels } from "@/lib/tutor-workspace";
import { RequestDeadline } from "./request-deadline";
import { TutorProgressionPanel } from "./tutor-progression";
function Data<T>({
  query,
  label,
  children,
}: {
  query: UseQueryResult<T, Error>;
  label: string;
  children: (value: T) => ReactNode;
}) {
  if (query.isPending)
    return (
      <p role="status" className="py-3 text-sm">
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
export function TutorDashboard() {
  const data = useTutorDashboard(),
    navigate = useNavigate();
  useEffect(() => {
    if (data.anonymous) void navigate({ to: "/auth/signin", replace: true });
  }, [data.anonymous, navigate]);
  if (!data.user)
    return (
      <AuthShell title="Your teaching workspace">
        {data.error ? (
          <>
            <Notice tone="error">{data.error}</Notice>
            <Button className="mt-4" onClick={() => void data.session.refetch()}>
              Try again
            </Button>
          </>
        ) : (
          <p role="status">
            {data.anonymous ? "Please sign in." : "Loading your teaching workspace…"}
          </p>
        )}
      </AuthShell>
    );
  if (!data.user.roles.includes("TUTOR"))
    return (
      <AuthShell title="Start teaching">
        <p className="text-muted-foreground">
          Enable the Tutor role in your account settings to open your teaching workspace.
        </p>
        <Link to="/account/settings" hash="roles" className="link mt-5 inline-block">
          Choose your account roles
        </Link>
      </AuthShell>
    );
  return (
    <AuthShell
      wide
      dashboard
      title="Your teaching workspace"
      intro="Manage your profile, teaching offers and learner enquiries."
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Button className="rounded-full" asChild>
          <Link to="/tutor/listings">Manage teaching offers</Link>
        </Button>
        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => void data.refresh()}
          disabled={data.session.isFetching}
        >
          Refresh workspace
        </Button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside aria-label="Tutor profile and access" className="min-w-0 space-y-5">
          <TutorProgressionPanel id={data.user.id} compact />
          <section className={panel + " bg-gradient-to-b from-amber-50 to-card"}>
            <h2 className="text-xl font-semibold">Profile & identity</h2>
            <div className="mt-4">
              <Data query={data.profile} label="Tutor profile">
                {({ profile }) =>
                  profile ? (
                    <>
                      <p className="break-words font-semibold">{profile.display_name}</p>
                      <p className="mt-2 text-sm">
                        {profile.eligible
                          ? "Your introduction is publicly eligible."
                          : `Profile: ${profile.publication_status?.toLowerCase() || "private draft"}`}
                      </p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Your profile and ads are free.{" "}
                        {profile.identity_label ||
                          (profile.identity_verified
                            ? "Identity verified."
                            : "Identity not verified.")}{" "}
                        Subject expertise is self-declared unless separately reviewed.
                      </p>
                      {profile.eligible && profile.public_id && (
                        <Link
                          to="/profiles/$profileId"
                          params={{ profileId: profile.public_id }}
                          className="link mt-4 block text-sm"
                        >
                          View public profile
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-sm">
                      Introduce yourself and create your first ad. Identity verification is
                      optional.
                    </p>
                  )
                }
              </Data>
            </div>
            <Link to="/tutor" className="link mt-4 inline-block text-sm">
              Manage profile & identity
            </Link>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-semibold">Tutor Pro</h2>
            <div className="mt-4">
              <Data query={data.pro} label="Tutor Pro">
                {(pro) => (
                  <>
                    <p className="font-semibold">{pro.active ? "Active" : "Not active"}</p>
                    {pro.active ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Valid until {new Date(pro.active.ends_at).toLocaleString()}.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Tutor Pro is optional for consented public email. Your ads can go online
                        without it. A pass does not verify identity or teaching qualifications.
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Separate from the Learner Access Pass and tuition.
                    </p>
                  </>
                )}
              </Data>
            </div>
            <Link to="/tutor" hash="tutor-pro" className="link mt-4 inline-block text-sm">
              View Tutor Pro options
            </Link>
          </section>
          <section className={panel}>
            <h2 className="text-lg font-semibold">Teaching preferences</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Keep your city, class modes, availability and usual teaching hours up to date.
            </p>
            <Link to="/tutor" className="link mt-4 inline-block text-sm">
              Manage location & availability
            </Link>
            <Link to="/connections" className="link mt-4 block text-sm">
              Open your Connections
            </Link>
          </section>
        </aside>
        <div className="min-w-0 space-y-6">
          <section className={panel}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="text-xl font-semibold">Teaching offers</h2>
              <Link to="/tutor/listings" className="link text-sm">
                View all offers
              </Link>
            </div>
            <div className="mt-5">
              <Data query={data.offers} label="Teaching offers">
                {(result) => (
                  <>
                    <div className="mb-5 grid grid-cols-3 gap-2">
                      {[
                        [
                          "Available",
                          result.listings.filter((l) => l.status === "PUBLISHED" && l.eligible)
                            .length,
                        ],
                        ["Drafts", result.listings.filter((l) => l.status === "DRAFT").length],
                        ["Offline", result.listings.filter((l) => l.status === "PAUSED").length],
                      ].map(([label, count]) => (
                        <div key={label} className="rounded-2xl bg-amber-50 p-3 text-center">
                          <p className="text-xl font-semibold">{count}</p>
                          <p className="mt-1 text-xs">{label}</p>
                        </div>
                      ))}
                    </div>
                    {result.listings.length ? (
                      <ul className="divide-y">
                        {focusTutorOffers(result.listings)
                          .slice(0, 4)
                          .map((item) => (
                            <li key={item.id} className="py-4 first:pt-0">
                              <h3 className="break-words font-semibold">{item.offer.title}</h3>
                              <p className="mt-2 text-sm font-medium">
                                {item.status === "PUBLISHED" && !item.eligible
                                  ? "Unavailable"
                                  : offerStatusLabels[item.status]}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {offerAvailability(item)}
                              </p>
                              {item.review_reason && (
                                <p className="mt-2 text-sm">
                                  Review feedback: {item.review_reason}
                                </p>
                              )}
                              {item.safety_reason && (
                                <p className="mt-2 text-sm">
                                  Safety decision: {item.safety_reason}
                                </p>
                              )}
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <div className="rounded-2xl bg-secondary p-5">
                        <h3 className="font-semibold">Ready to describe your classes?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Choose an available subject, add your teaching details and review the rate
                          before publishing your ad for free. Identity verification is optional.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Data>
            </div>
          </section>
          <section className={panel}>
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="text-xl font-semibold">Recent learner enquiries</h2>
              <Link to="/tutor/requests" className="link text-sm">
                View incoming enquiries
              </Link>
            </div>
            <div className="mt-5">
              <Data query={data.requests} label="Tutor enquiries">
                {(result) =>
                  result.requests.length ? (
                    <ul className="divide-y">
                      {result.requests.slice(0, 3).map((request) => (
                        <li key={request.id} className="py-4 first:pt-0">
                          <h3 className="break-words font-semibold">{request.offer.title}</h3>
                          <div className="text-sm">
                            <RequestDeadline request={request} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-2xl bg-secondary p-5">
                      <h3 className="font-semibold">No incoming enquiries yet</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Eligible published offers help learners discover your classes. An enquiry is
                        a request to connect, not a confirmed booking.
                      </p>
                    </div>
                  )
                }
              </Data>
            </div>
          </section>
        </div>
      </div>
    </AuthShell>
  );
}
