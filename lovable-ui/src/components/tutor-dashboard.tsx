import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  Camera,
  ChevronRight,
  Eye,
  MapPin,
  Megaphone,
  Pencil,
  Sparkles,
} from "lucide-react";
import { AuthShell, Notice } from "./account/ui";
import { Button } from "./ui/button";
import { useTutorDashboard } from "@/lib/tutor-dashboard";
import { focusTutorOffers, offerAvailability, offerStatusLabels } from "@/lib/tutor-workspace";
import { reputationApi } from "@/lib/tutor-reputation-api";
import type { TeachingListing } from "@/lib/api";
import { AccountAvatar } from "./account-avatar";
import { useReputationRead } from "./tutor-progression";
import { Chip, SectionData, ShareProfileButton, WsCard } from "./workspace-ui";

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
  const place = data.presence.data?.presence.location;
  const city = place ? [place.city, place.state].filter(Boolean).join(", ") : undefined;
  const name = (profile?.display_name || data.user.display_name).trim();
  const progress = progression.data?.ok === true ? progression.data.data : undefined;
  const levels = progress?.levels ?? [
    { id: "NEW", label: "New" },
    { id: "EXPERIENCED", label: "Experienced" },
    { id: "SUPER_TEACHER", label: "Super Teacher" },
    { id: "AMBASSADOR", label: "Ambassador" },
  ];

  // Approved minimal dashboard (D1): profile, level and ads. Enquiries live in My messages,
  // where the menu shows how many still need a reply; nothing is removed from the product.
  return (
    <AuthShell wide dashboard reference title="Your teaching workspace">
      <div className="md">
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
            {online && (
              <section className="md-level" aria-label="Your Tutor level">
                <ol>
                  {levels.map((level) => {
                    const current = progress?.level === level.id;
                    return (
                      <li key={level.id} className={current ? "is-now" : undefined}>
                        <span>
                          {current ? <span className="md-now">{level.label}</span> : level.label}
                        </span>
                        <i aria-hidden="true" />
                        {current && <span className="sr-only">Current level</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="md-up">
                  <Link to="/tutor/evaluations">
                    Grow my level <ChevronRight aria-hidden="true" className="size-4" />
                  </Link>
                </p>
              </section>
            )}
            <WsCard
              title="My ads"
              action={
                <Link to="/tutor/listings" className="ws-link">
                  Manage <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              }
            >
              <SectionData query={data.offers} label="Your ads">
                {(result) =>
                  result.listings.length ? (
                    <ul className="md-ads">
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
