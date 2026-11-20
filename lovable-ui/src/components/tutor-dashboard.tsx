import "../workspace.css";
import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  Eye,
  Hourglass,
  Inbox,
  MapPin,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { AuthShell, Notice } from "./account/ui";
import { Button } from "./ui/button";
import { useTutorDashboard } from "@/lib/tutor-dashboard";
import { isPendingNow, timeLeft, useEnquiryState } from "@/lib/workspace";
import type { IncomingRequest } from "@/lib/api";
import { AccountAvatar } from "./account-avatar";
import { Chip, SectionData, ShareProfileButton, WsCard } from "./workspace-ui";

function EnquiryRow({ request }: { request: IncomingRequest }) {
  const { status, remaining } = useEnquiryState(request);
  return (
    <li className="md-enq">
      <span className="md-enq-icon" aria-hidden="true">
        <Inbox className="size-5" />
      </span>
      <div className="min-w-0">
        <b className="break-words">{request.offer.title}</b>
        {request.learning_requirements && (
          <p className="md-enq-text ws-clamp">{request.learning_requirements}</p>
        )}
        {request.preferred_times && <p className="md-enq-text">{request.preferred_times}</p>}
      </div>
      <div className="md-enq-side">
        {status === "PENDING" ? (
          <Chip tone={remaining <= 24 * 3600000 ? "warn" : "wait"} icon={Hourglass}>
            Reply within {timeLeft(remaining)}
          </Chip>
        ) : status === "ACCEPTED" ? (
          <Chip tone="ok" icon={Check}>
            Accepted
          </Chip>
        ) : (
          <Chip>
            {status === "DECLINED" ? "Declined" : status === "CANCELLED" ? "Cancelled" : "Expired"}
          </Chip>
        )}
        {status === "PENDING" ? (
          <Link to="/connections" search={{ tab: "enquiries" }} className="ws-link">
            Reply <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : status === "ACCEPTED" && request.connection_id ? (
          <Link
            to="/connections"
            search={{ conversation: request.connection_id }}
            className="ws-link"
          >
            Open chat <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

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
  // Workspace access is not a published ad, and it is not a role the owner has
  // to pick first. An account with no teaching draft yet is simply invited to
  // start one; the Tutor role is recorded when that first private draft saves.
  if (!data.user.roles.includes("TUTOR"))
    return (
      <AuthShell title="Start teaching">
        <p className="text-muted-foreground">
          You have not started a teaching introduction yet. Nothing is published while you work on
          it, and you keep using the same account to learn.
        </p>
        <Link to="/tutor" className="link mt-5 inline-block">
          Start your teaching introduction
        </Link>
      </AuthShell>
    );
  const listings = data.offers.data?.listings;
  const live = listings?.filter((l) => l.status === "PUBLISHED" && l.eligible).length ?? 0;
  // ADR0021: the Tutor level and Tutor Pro only matter once an ad is online.
  const online = live > 0;
  // A new Tutor with no profile and no ad has nothing to manage yet: one clear next step
  // instead of empty panels (ADR0021).
  if (data.profile.data?.profile === null && listings?.length === 0)
    return (
      <AuthShell wide dashboard reference title="Your teaching workspace">
        <div className="ws">
          <section className="ws-hero ws-hero-solo" aria-labelledby="first-ad">
            <span className="ws-tile ws-tile-butter" aria-hidden="true">
              <Megaphone className="size-5" />
            </span>
            <h2 id="first-ad">Create your first ad</h2>
            <p>
              Send your details to our team and we create it for you, or create it yourself in one
              short form. Both are free.
            </p>
            <Link to="/tutor" className="ws-btn ws-btn-primary">
              Become a Tutor
            </Link>
          </section>
        </div>
      </AuthShell>
    );

  const profile = data.profile.data?.profile ?? null;
  const shareUrl =
    profile?.eligible && profile.public_id && typeof window !== "undefined"
      ? `${window.location.origin}/profiles/${profile.public_id}`
      : undefined;
  const place = data.presence.data?.presence.location;
  const city = place ? [place.city, place.state].filter(Boolean).join(", ") : undefined;
  const name = (profile?.display_name || data.user.display_name).trim();
  const waiting = data.requests.data?.requests.filter((r) => isPendingNow(r)).length ?? 0;

  // Approved dashboard ("E1 final", 20 Nov 2026): profile, enquiries and the optional Tutor Pro.
  // My ads has its own tab, and the Tutor level lives in Evaluations > My level.
  return (
    <AuthShell wide dashboard reference title="Your teaching workspace">
      <div className="md">
        {/* Without the ads we cannot say whether learners can find this Tutor. */}
        {data.offers.isError && (
          <div className="space-y-3">
            <Notice tone="error">Your ads could not be loaded.</Notice>
            <Button variant="outline" onClick={() => void data.offers.refetch()}>
              Retry your ads
            </Button>
          </div>
        )}
        {/* Having this workspace is not the same as being visible to learners. */}
        {data.offers.data && !online && (
          <section role="status" aria-labelledby="not-found-yet" className="ws-alert">
            <div>
              <h2 id="not-found-yet">Learners can't find you yet</h2>
              <p>
                Nothing is published yet, so learners cannot see or contact you. Publish your first
                ad. It's free and takes a minute.
              </p>
            </div>
            <Link to="/tutor/listings" className="ws-btn ws-btn-primary">
              Publish my first ad
            </Link>
          </section>
        )}
        <div className="md-grid">
          <section className="md-card md-profile" aria-labelledby="md-name">
            <div className="md-photo">
              <AccountAvatar user={data.user} decorative className="md-photo-img" />
              <Link
                to="/account/settings"
                className="md-photo-btn"
                aria-label="Change profile photo"
              >
                <Camera aria-hidden="true" className="size-[18px]" />
              </Link>
            </div>
            <h2 id="md-name">{name}</h2>
            {city && (
              <p className="md-city">
                <MapPin aria-hidden="true" className="size-4" />
                {city}
              </p>
            )}
            <div className="md-checks">
              <p>
                Email
                {data.user.email_verified ? (
                  <span className="md-ok">
                    <BadgeCheck aria-hidden="true" className="size-4" />
                    Verified
                  </span>
                ) : (
                  <Link to="/account/settings">Verify email</Link>
                )}
              </p>
              <p>
                Identity
                {profile?.identity_verified ? (
                  <span className="md-ok">
                    <BadgeCheck aria-hidden="true" className="size-4" />
                    Verified
                  </span>
                ) : (
                  <Link to="/tutor">Verify (optional)</Link>
                )}
              </p>
            </div>
            <div className="md-links">
              {profile?.eligible && profile.public_id && (
                <Link
                  to="/profiles/$profileId"
                  params={{ profileId: profile.public_id }}
                  className="ws-btn ws-btn-soft ws-btn-sm"
                >
                  <Eye aria-hidden="true" className="size-4" />
                  Public profile
                </Link>
              )}
              {shareUrl && <ShareProfileButton url={shareUrl} label="Share" tone="soft" />}
            </div>
          </section>

          <div className="md-main">
            <WsCard
              title="Enquiries"
              badge={
                waiting > 0 && (
                  <span className="md-enq-count">
                    {waiting}
                    <span className="sr-only"> waiting for a reply</span>
                  </span>
                )
              }
              action={
                <Link to="/connections" search={{ tab: "enquiries" }} className="ws-link">
                  See all <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              }
            >
              <SectionData query={data.requests} label="Your enquiries">
                {(result) =>
                  result.requests.length ? (
                    <ul className="md-enqs">
                      {result.requests.slice(0, 5).map((request) => (
                        <EnquiryRow key={request.id} request={request} />
                      ))}
                    </ul>
                  ) : (
                    <div className="ws-empty ws-empty-left">
                      <h3>No enquiries yet</h3>
                      <p>
                        When a learner contacts you, it appears here with the time left to reply. An
                        enquiry is a request to connect, not a confirmed booking.
                      </p>
                    </div>
                  )
                }
              </SectionData>
            </WsCard>
          </div>

          {online && (
            <section className="md-pro" aria-labelledby="md-pro-title">
              <h2 id="md-pro-title">
                <Sparkles aria-hidden="true" className="size-5" />
                Tutor Pro
              </h2>
              <SectionData query={data.pro} label="Tutor Pro">
                {(pro) => (
                  <>
                    <p className="md-pro-state">{pro.active ? "Active" : "Not active"}</p>
                    <p>
                      {pro.active
                        ? `Valid until ${new Date(pro.active.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
                        : "Optional. Show your verified email on your profile. Your ads stay online without it."}
                    </p>
                  </>
                )}
              </SectionData>
              <Link to="/tutor" hash="tutor-pro" className="md-pro-link">
                Learn more
              </Link>
            </section>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
