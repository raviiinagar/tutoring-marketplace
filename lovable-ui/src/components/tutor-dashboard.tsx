import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  ChevronRight,
  Eye,
  Hourglass,
  Inbox,
  MapPin,
  Megaphone,
  MessagesSquare,
  Pencil,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";
import { AuthShell, Notice } from "./account/ui";
import { Button } from "./ui/button";
import { useTutorDashboard } from "@/lib/tutor-dashboard";
import { focusTutorOffers, offerAvailability, offerStatusLabels } from "@/lib/tutor-workspace";
import { reputationApi } from "@/lib/tutor-reputation-api";
import type { IncomingRequest, TeachingListing } from "@/lib/api";
import { AccountAvatar } from "./account-avatar";
import { TutorProgressionPanel, useReputationRead } from "./tutor-progression";
import {
  Chip,
  JourneyTrack,
  ProgressRing,
  SectionData,
  ShareProfileButton,
  StatTile,
  WsCard,
} from "./workspace-ui";
import { greeting, isPendingNow, timeLeft, useEnquiryState } from "@/lib/workspace";

const RECOMMENDATIONS_FOR_NEXT_LEVEL = 2;

function EnquiryRow({ request }: { request: IncomingRequest }) {
  const { status, remaining } = useEnquiryState(request);
  return (
    <li className="ws-row">
      <span className="ws-row-icon" aria-hidden="true">
        <Inbox className="size-5" />
      </span>
      <div className="min-w-0">
        <b className="break-words">{request.offer.title}</b>
        {request.learning_requirements && (
          <p className="ws-row-meta ws-clamp">{request.learning_requirements}</p>
        )}
        <div className="ws-row-actions">
          {status === "PENDING" ? (
            <Chip tone={remaining <= 24 * 3600000 ? "warn" : "wait"} icon={Hourglass}>
              Reply within {timeLeft(remaining)}
            </Chip>
          ) : status === "ACCEPTED" ? (
            <Chip tone="ok">Accepted</Chip>
          ) : (
            <Chip>
              {status === "DECLINED"
                ? "Declined"
                : status === "CANCELLED"
                  ? "Cancelled"
                  : "Expired"}
            </Chip>
          )}
          {status === "PENDING" ? (
            <Link to="/connections" className="ws-link">
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
      </div>
    </li>
  );
}

function AdRow({ item }: { item: TeachingListing }) {
  const live = item.status === "PUBLISHED" && item.eligible;
  return (
    <li className="ws-ad">
      <div className="min-w-0">
        <Chip tone={live ? "ok" : item.status === "SAFETY_SUSPENDED" ? "warn" : "neutral"}>
          {item.status === "PUBLISHED" && !item.eligible
            ? "Unavailable"
            : offerStatusLabels[item.status]}
        </Chip>
        <h3 className="break-words">{item.offer.title}</h3>
        <p className="ws-row-meta">{offerAvailability(item)}</p>
        <div className="ws-pills">
          <span>{item.offer.teaching_mode === "ONLINE" ? "Online" : "In person"}</span>
          <span>
            ₹{(item.offer.rate_paise / 100).toLocaleString("en-IN")} /{" "}
            {item.offer.rate_unit === "HOUR" ? "hour" : "class"}
          </span>
        </div>
        {item.review_reason && (
          <p className="mt-2 text-sm">Review feedback: {item.review_reason}</p>
        )}
        {item.safety_reason && (
          <p className="mt-2 text-sm">Safety decision: {item.safety_reason}</p>
        )}
      </div>
      <Link to="/tutor/listings" className="ws-btn ws-btn-soft ws-btn-sm">
        <Pencil aria-hidden="true" className="size-4" />
        Edit
      </Link>
    </li>
  );
}

export function TutorDashboard() {
  const data = useTutorDashboard(),
    navigate = useNavigate();
  const progression = useReputationRead(
    data.user?.roles.includes("TUTOR") ? data.user.id : undefined,
    "progression",
    reputationApi.progression,
  );
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
  const presence = data.presence.data?.presence;
  const placeAndHours = !!presence?.location && presence.weekly_slots.length > 0;
  const recommendations =
    progression.data?.ok === true ? progression.data.data.counts.recommendations : undefined;
  const steps = [
    {
      title: "Profile and first ad",
      done: online,
      icon: Megaphone,
      note: online ? (
        "Done"
      ) : (
        <Link to="/tutor/listings" className="ws-link">
          Publish an ad
        </Link>
      ),
    },
    {
      title: "City and hours",
      done: placeAndHours,
      icon: MapPin,
      note: placeAndHours ? (
        "Done"
      ) : (
        <Link to="/tutor" className="ws-link">
          Add now
        </Link>
      ),
    },
    {
      title: `${RECOMMENDATIONS_FOR_NEXT_LEVEL} recommendations`,
      done: (recommendations ?? 0) >= RECOMMENDATIONS_FOR_NEXT_LEVEL,
      icon: Star,
      note:
        (recommendations ?? 0) >= RECOMMENDATIONS_FOR_NEXT_LEVEL ? (
          "Done"
        ) : (
          <Link to="/tutor/evaluations" className="ws-link">
            {recommendations === undefined
              ? "Ask"
              : `${recommendations} of ${RECOMMENDATIONS_FOR_NEXT_LEVEL} · Ask`}
          </Link>
        ),
    },
    {
      title: "Verify identity",
      done: !!profile?.identity_verified,
      icon: BadgeCheck,
      note: profile?.identity_verified ? (
        "Done"
      ) : (
        <Link to="/tutor" className="ws-link">
          Optional
        </Link>
      ),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const name = (profile?.display_name || data.user.display_name).trim();
  const pending = data.requests.data?.requests.filter((r) => isPendingNow(r)).length;
  const unread = data.conversations.data?.connections.reduce(
    (sum, c) => sum + (c.unread_count ?? 0),
    0,
  );
  const known = (value: number | undefined, failed: boolean) =>
    value !== undefined ? value : failed ? "–" : "…";

  return (
    <AuthShell wide dashboard reference title="Your teaching workspace">
      <div className="ws">
        <section className="ws-hero" aria-labelledby="ws-hi">
          <div className="ws-hero-top">
            <div className="ws-hero-photo">
              <ProgressRing done={done} total={steps.length}>
                <AccountAvatar user={data.user} decorative className="ws-avatar" />
              </ProgressRing>
              <p className="ws-ring-caption">
                {done} of {steps.length} steps done
              </p>
            </div>
            <div className="min-w-0">
              {data.offers.data &&
                (online ? (
                  <span className="ws-live">
                    <i aria-hidden="true" />
                    {live} {live === 1 ? "ad" : "ads"} live · learners can find you
                  </span>
                ) : (
                  <span className="ws-live ws-live-off">Not visible to learners yet</span>
                ))}
              <h2 id="ws-hi" className="ws-hello">
                {greeting()}, <span>{name}</span>
              </h2>
              <p className="ws-hero-text">
                {!online
                  ? "Publish an ad so learners can find and contact you."
                  : done === steps.length
                    ? "Your profile is complete. Share it to reach more learners."
                    : `${steps.length - done} more ${steps.length - done === 1 ? "step" : "steps"} to a complete profile.`}
                {profile && !profile.eligible && (
                  <> Profile: {profile.publication_status?.toLowerCase() || "private draft"}.</>
                )}
              </p>
            </div>
            <div className="ws-cta">
              {shareUrl ? (
                <ShareProfileButton url={shareUrl} />
              ) : (
                <Link to="/tutor/listings" className="ws-btn ws-btn-primary">
                  Manage my ads
                </Link>
              )}
              {profile?.eligible && profile.public_id && (
                <Link
                  to="/profiles/$profileId"
                  params={{ profileId: profile.public_id }}
                  className="ws-btn ws-btn-soft"
                >
                  <Eye aria-hidden="true" className="size-[18px]" />
                  View public profile
                </Link>
              )}
              <Link to="/tutor" className="ws-link ws-cta-link">
                Manage profile & identity
              </Link>
            </div>
          </div>
          <JourneyTrack label="Your path to more students" steps={steps} />
        </section>

        {/* Having this workspace is not the same as being visible to learners.
            State it plainly, so an owner is never left guessing whether their work is public. */}
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

        <section className="ws-stats" aria-label="Your numbers">
          <StatTile
            icon={Megaphone}
            tone="ok"
            value={known(listings ? live : undefined, data.offers.isError)}
            label={live === 1 ? "Ad live" : "Ads live"}
            to="/tutor/listings"
          />
          <StatTile
            icon={Inbox}
            value={known(pending, data.requests.isError)}
            label="New enquiries"
            to="/connections"
          />
          <StatTile
            icon={MessagesSquare}
            tone="peach"
            value={known(unread, data.conversations.isError)}
            label="Unread messages"
            to="/connections"
          />
          <StatTile
            icon={Star}
            tone="butter"
            value={known(recommendations, progression.isError || progression.data?.ok === false)}
            label="Recommendations"
            to="/tutor/evaluations"
          />
        </section>

        <div className="ws-layout">
          <WsCard
            title="Learner enquiries"
            action={
              <Link to="/tutor/requests" className="ws-link">
                See all <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            }
          >
            <SectionData query={data.requests} label="Tutor enquiries">
              {(result) =>
                result.requests.length ? (
                  <ul className="ws-rows">
                    {result.requests.slice(0, 3).map((request) => (
                      <EnquiryRow key={request.id} request={request} />
                    ))}
                  </ul>
                ) : (
                  <div className="ws-empty">
                    <span className="ws-empty-art" aria-hidden="true">
                      <Inbox className="size-7" />
                    </span>
                    <h3>No incoming enquiries yet</h3>
                    <p>
                      When a learner contacts you, it appears here with the time left to reply. An
                      enquiry is a request to connect, not a confirmed booking.
                    </p>
                    {shareUrl && <ShareProfileButton url={shareUrl} className="ws-btn-sm" />}
                  </div>
                )
              }
            </SectionData>
          </WsCard>

          <WsCard
            title="My ads"
            action={
              <Link to="/tutor/listings" className="ws-link">
                Manage ads <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            }
          >
            <SectionData query={data.offers} label="Your ads">
              {(result) => (
                <>
                  <div className="ws-counts">
                    {(
                      [
                        ["Available", live],
                        ["Drafts", result.listings.filter((l) => l.status === "DRAFT").length],
                        ["Offline", result.listings.filter((l) => l.status === "PAUSED").length],
                      ] as const
                    ).map(([label, count]) => (
                      <div key={label}>
                        <p className="ws-count">{count}</p>
                        <p className="text-xs">{label}</p>
                      </div>
                    ))}
                  </div>
                  {result.listings.length ? (
                    <ul className="ws-ads">
                      {focusTutorOffers(result.listings)
                        .slice(0, 3)
                        .map((item) => (
                          <AdRow key={item.id} item={item} />
                        ))}
                    </ul>
                  ) : (
                    <div className="ws-empty ws-empty-left">
                      <h3>Ready to describe your classes?</h3>
                      <p>
                        Choose an available subject, add your teaching details and review the rate
                        before publishing your ad for free. Identity verification is optional.
                      </p>
                    </div>
                  )}
                  <Link to="/tutor/listings" className="ws-new-ad">
                    <Plus aria-hidden="true" className="size-[18px]" />
                    Create another ad
                  </Link>
                </>
              )}
            </SectionData>
          </WsCard>
        </div>

        {online && (
          <div className="ws-layout">
            <TutorProgressionPanel id={data.user.id} compact />
            <WsCard
              title="Tutor Pro"
              action={
                <Link to="/tutor" hash="tutor-pro" className="ws-link">
                  Options <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              }
            >
              <SectionData query={data.pro} label="Tutor Pro">
                {(pro) => (
                  <div className="ws-pro">
                    <span className="ws-tile ws-tile-butter" aria-hidden="true">
                      <Sparkles className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">{pro.active ? "Active" : "Not active"}</p>
                      <p className="ws-row-meta">
                        {pro.active
                          ? `Valid until ${new Date(pro.active.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
                          : "Optional. Show your verified email on your profile. Your ads stay online without it, and it does not verify identity or qualifications."}
                      </p>
                    </div>
                  </div>
                )}
              </SectionData>
            </WsCard>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
