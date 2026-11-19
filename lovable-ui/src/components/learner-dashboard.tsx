import { accountInitial } from "@/lib/account-photo";
import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  GraduationCap,
  Heart,
  Hourglass,
  Inbox,
  LifeBuoy,
  MessageSquareText,
  MessagesSquare,
  Search,
  Ticket,
  UserRound,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { TeachingCard } from "./teaching-card";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
import { useLearnerDashboard } from "@/lib/learner-dashboard";
import type { ContactRequest } from "@/lib/api";
import { formatClassTime, useUpcomingClasses } from "@/lib/upcoming-class";
import { useTeachingPresence } from "@/lib/teaching-presence";
import { AccountAvatar } from "./account-avatar";
import { siteFeatures } from "@/lib/site-visibility";
import { Chip, JourneyTrack, ProgressRing, StatTile, WsCard } from "./workspace-ui";
import { greeting, timeLeft, useEnquiryState } from "@/lib/workspace";

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
  // ADR0021: teaching-only accounts have no learner dashboard, so they go to their teaching one.
  const teachingOnly = !!user && user.roles.includes("TUTOR") && !user.roles.includes("LEARNER");
  useEffect(() => {
    if (teachingOnly) void navigate({ to: "/tutor/dashboard", replace: true });
  }, [teachingOnly, navigate]);
  const connections = data.connections.data?.connections;
  const upcoming = useUpcomingClasses(user?.id, connections);
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
  const usableProfile = data.learners.data?.profiles.some((p) => p.usable) ?? false;
  const enquiries = data.requests.data?.requests ?? [];
  const connected = (connections?.length ?? 0) > 0;
  const enquired = enquiries.length > 0 || connected;
  const next = upcoming.next;
  const unread = connections?.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  const known = (value: number | undefined, failed: boolean) =>
    value !== undefined ? value : failed ? "–" : "…";
  const steps = [
    {
      title: "Learner profile",
      done: usableProfile,
      icon: UserRound,
      note: usableProfile ? (
        "Done"
      ) : (
        <Link to="/learners" className="ws-link">
          Create it
        </Link>
      ),
    },
    {
      title: "Send an enquiry",
      done: enquired,
      icon: Search,
      note: enquired ? (
        "Done"
      ) : (
        <Link to="/tutors" className="ws-link">
          Find a tutor
        </Link>
      ),
    },
    {
      title: "Tutor accepts",
      done: connected,
      icon: Check,
      note: connected ? "Done" : "Tutors reply within 72 hours",
    },
    {
      title: "First class",
      done: false,
      icon: Video,
      note: next ? formatClassTime(next.starts_at) : "Your Tutor shares the time",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <AuthShell title="Dashboard" reference dashboard>
      <div className="ws">
        <section className="ws-hero" aria-labelledby="ws-hi">
          <div className="ws-hero-top">
            <div className="ws-hero-photo">
              <ProgressRing done={done} total={steps.length}>
                <Link
                  to="/account/settings"
                  className="ws-avatar-link"
                  aria-label={`${accountInitial(user.display_name)} Manage your profile`}
                >
                  <AccountAvatar decorative user={user} className="ws-avatar" />
                </Link>
              </ProgressRing>
            </div>
            <div className="min-w-0">
              <span className={`ws-live${user.email_verified ? "" : " ws-live-off"}`}>
                {user.email_verified ? (
                  <BadgeCheck aria-hidden className="size-4" />
                ) : (
                  <X aria-hidden className="size-4" />
                )}
                {user.email_verified ? "Email verified" : "Email not verified"}
              </span>
              <h2 id="ws-hi" className="ws-hello">
                {greeting()}, <span>{user.display_name}</span>
              </h2>
              <p className="ws-hero-text">
                {next
                  ? `Your next class is ${formatClassTime(next.starts_at)} with ${next.with.replace(/\.$/, "")}.`
                  : enquired
                    ? "Your enquiries, messages and classes are all here."
                    : "Find a tutor and send your first enquiry. Browsing is free."}
              </p>
              <Link to="/account/settings" className="ws-link">
                Manage your account
              </Link>
            </div>
            <div className="ws-cta">
              <Link to="/tutors" className="ws-btn ws-btn-primary">
                <Search aria-hidden className="size-[18px]" />
                Find a tutor
              </Link>
              <Link to="/saved-tutors" className="ws-btn ws-btn-soft">
                <Heart aria-hidden className="size-[18px]" />
                Saved Tutors
              </Link>
            </div>
          </div>
          <JourneyTrack label="Your path to your first class" steps={steps} />
        </section>

        <section className="ws-stats" aria-label="Your numbers">
          <StatTile
            icon={MessagesSquare}
            tone="peach"
            value={known(unread, data.connections.isError)}
            label="Unread messages"
            to="/connections"
          />
          <StatTile
            icon={Inbox}
            value={
              data.access.data
                ? `${data.access.data.pending_count} of ${data.access.data.pending_limit}`
                : data.access.isError
                  ? "–"
                  : "…"
            }
            label="Enquiries waiting"
            to="/requests"
          />
          <StatTile
            icon={Heart}
            tone="butter"
            value={known(data.saved.data?.items.length, data.saved.isError)}
            label="Saved Tutors"
            to="/saved-tutors"
          />
          <StatTile
            icon={CalendarClock}
            tone="ok"
            value={
              connections ? upcoming.classes.length : known(undefined, data.connections.isError)
            }
            label="Upcoming classes"
            to="/connections"
          />
        </section>

        <div className="ws-layout">
          <WsCard
            id="enquiries"
            title="My enquiries"
            action={
              <Link to="/requests" className="ws-link">
                View all <ChevronRight aria-hidden className="size-4" />
              </Link>
            }
          >
            <DashboardData query={data.requests} label="Enquiries">
              {(result) =>
                result.requests.length ? (
                  <ul className="ws-rows">
                    {result.requests.slice(0, 3).map((request) => (
                      <LearnerEnquiry key={request.id} request={request} />
                    ))}
                  </ul>
                ) : (
                  <div className="ws-empty">
                    <span className="ws-empty-art" aria-hidden="true">
                      <Inbox className="size-7" />
                    </span>
                    <h3>No enquiries yet</h3>
                    <p>Find a tutor you like and send an enquiry. They have 72 hours to reply.</p>
                    <Link to="/tutors" className="ws-btn ws-btn-primary ws-btn-sm">
                      Find a tutor
                    </Link>
                  </div>
                )
              }
            </DashboardData>
          </WsCard>

          <div className="ws-side">
            <WsCard title="Next class">
              {next ? (
                <div className="ws-class">
                  <b>{next.title}</b>
                  <span>
                    <CalendarClock aria-hidden className="size-[18px]" />
                    {formatClassTime(next.starts_at)} · {next.duration_minutes} min
                  </span>
                  <span>
                    <UserRound aria-hidden className="size-[18px]" />
                    With {next.with} · Google Meet
                  </span>
                  <Link
                    to="/connections"
                    search={{ conversation: next.connectionId, view: "classes" }}
                    className="ws-btn ws-btn-ink ws-btn-sm"
                  >
                    <Video aria-hidden className="size-[18px]" />
                    Open class
                  </Link>
                  <small>Join opens shortly before the class starts.</small>
                </div>
              ) : (
                <p className="ws-note">
                  <CalendarClock aria-hidden className="size-4" />
                  {upcoming.loading
                    ? "Checking your classes…"
                    : "No class planned yet. When your Tutor plans one, it appears here."}
                </p>
              )}
            </WsCard>

            <WsCard
              title="Your Access Pass"
              action={
                <Link to="/payments" className="ws-link">
                  View pass and payments <ChevronRight aria-hidden className="size-4" />
                </Link>
              }
            >
              <DashboardData query={data.access} label="Access Pass">
                {(access) => (
                  <div className="ws-pass">
                    <span className="ws-tile ws-tile-butter" aria-hidden="true">
                      <Ticket className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {access.coverage
                          ? access.coverage.status === "ACTIVE"
                            ? `Active until ${new Date(access.coverage.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                            : "Ready for your first acceptance"
                          : "No current Access Pass. Browse Tutors for free."}
                      </p>
                      <div className="ws-meter" aria-hidden="true">
                        <i
                          style={{
                            width: `${Math.min(100, (access.pending_count / Math.max(1, access.pending_limit)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="ws-row-meta">
                        <strong>{access.pending_count}</strong> of {access.pending_limit} pending
                        enquiries
                      </p>
                    </div>
                  </div>
                )}
              </DashboardData>
            </WsCard>
          </div>
        </div>

        <nav className="ws-tiles" aria-label="Learning tools and access">
          <Link to="/learners" className="ws-tl">
            <span className="ws-tile" aria-hidden="true">
              <UserRound className="size-5" />
            </span>
            My learner profile
          </Link>
          <Link to="/notifications" className="ws-tl">
            <span className="ws-tile" aria-hidden="true">
              <Bell className="size-5" />
            </span>
            Notifications
          </Link>
          <Link to="/support" className="ws-tl">
            <span className="ws-tile" aria-hidden="true">
              <LifeBuoy className="size-5" />
            </span>
            Help
          </Link>
          <Link to="/feedback" className="ws-tl">
            <span className="ws-tile" aria-hidden="true">
              <MessageSquareText className="size-5" />
            </span>
            Send feedback
          </Link>
          {siteFeatures.community && (
            <Link to="/community" className="ws-tl">
              <span className="ws-tile" aria-hidden="true">
                <UsersRound className="size-5" />
              </span>
              Community
            </Link>
          )}
        </nav>

        <TeachingSection />
      </div>
    </AuthShell>
  );
}

function LearnerEnquiry({ request }: { request: ContactRequest }) {
  const { status, remaining } = useEnquiryState(request);
  return (
    <li className="ws-row">
      <span className="ws-row-icon" aria-hidden="true">
        <Inbox className="size-5" />
      </span>
      <div className="min-w-0">
        <b className="break-words">{request.offer.title}</b>
        <div className="ws-row-actions">
          {status === "PENDING" ? (
            <Chip tone={remaining <= 24 * 3600000 ? "warn" : "wait"} icon={Hourglass}>
              Waiting · {timeLeft(remaining)} left to reply
            </Chip>
          ) : status === "ACCEPTED" ? (
            <Chip tone="ok" icon={Check}>
              Accepted
            </Chip>
          ) : (
            <Chip icon={Clock}>
              {status === "DECLINED"
                ? "Declined"
                : status === "CANCELLED"
                  ? "Cancelled"
                  : "Expired"}
            </Chip>
          )}
          {status === "ACCEPTED" && request.connection_id ? (
            <Link
              to="/connections"
              search={{ conversation: request.connection_id }}
              className="ws-link"
            >
              Open chat <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <Link to="/requests" className="ws-link">
              {status === "PENDING" ? "View request" : "Find similar Tutors"}{" "}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** Tutors see their teaching summary; everyone else is invited to teach with a free ad. */
function TeachingSection() {
  const { isTutor } = useTeachingPresence();
  if (isTutor) return <TeachingCard />;
  return (
    <section className="ws-teach" aria-labelledby="become-tutor">
      <span className="ws-tile" aria-hidden="true">
        <GraduationCap className="size-5" />
      </span>
      <div>
        <h2 id="become-tutor">Become a Tutor</h2>
        <p>Teach what you know. Publish a free ad and learners can find and contact you.</p>
      </div>
      <Link to="/tutor" className="ws-btn ws-btn-primary">
        Start teaching
      </Link>
    </section>
  );
}
