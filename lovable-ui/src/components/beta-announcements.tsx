import { Link } from "@tanstack/react-router";
import { Megaphone, Pause, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useBetaFeatures, type BetaFeature } from "@/lib/beta-features";

type Announcement = {
  id: string;
  feature: BetaFeature;
  text: string;
  to: "/community" | "/feedback";
  action: string;
};

// Curated in code so signed-out visitors never read member-only community content.
// Change the version whenever the list changes, so people who dismissed it see the new items.
const announcementsVersion = "2026-11-10";
const announcements: Announcement[] = [
  {
    id: "community-launch",
    feature: "community",
    text: "New: a live community chat for beta members and our team.",
    to: "/community",
    action: "Join the community",
  },
  {
    id: "feedback-launch",
    feature: "feedback",
    text: "New: report a bug with a screenshot, or suggest an improvement.",
    to: "/feedback",
    action: "Send feedback",
  },
  {
    id: "feedback-board",
    feature: "feedback",
    text: "Vote for the ideas you want next on the members' suggestion board.",
    to: "/feedback",
    action: "See the ideas",
  },
];
const dismissKey = `beta-announcements-dismissed:${announcementsVersion}`;

function readDismissed() {
  try {
    return window.localStorage.getItem(dismissKey) === "1";
  } catch {
    return false;
  }
}

function TickerItems({ items, copy }: { items: Announcement[]; copy?: boolean }) {
  return (
    <ul className="announcement-list" aria-hidden={copy || undefined}>
      {items.map((item) => (
        <li key={item.id} className="announcement-item">
          <span>{item.text}</span>{" "}
          <Link to={item.to} tabIndex={copy ? -1 : undefined} className="announcement-link">
            {item.action}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Scrolling beta announcements under the site header. Pausable, dismissible, still for reduced motion. */
export function AnnouncementTicker() {
  const features = useBetaFeatures();
  const [dismissed, setDismissed] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => setDismissed(readDismissed()), []);
  const items = announcements.filter((item) => features[item.feature]);
  if (dismissed || items.length === 0) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey, "1");
    } catch {
      // Storage can be blocked; the bar still closes for this page view.
    }
  };
  return (
    <section
      aria-label="Announcements"
      className="announcement-bar"
      data-paused={paused ? "" : undefined}
    >
      <div className="announcement-inner mx-auto flex max-w-[1500px] items-center gap-2 px-5 lg:px-8">
        <span className="announcement-badge">
          <Megaphone aria-hidden className="size-4" />
          Beta
        </span>
        <div className="announcement-viewport">
          <div className="announcement-track">
            <TickerItems items={items} />
            <TickerItems items={items} copy />
          </div>
        </div>
        <button
          type="button"
          className="announcement-control announcement-pause"
          aria-label="Pause announcements"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          <Pause aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          className="announcement-control"
          aria-label="Dismiss announcements"
          onClick={dismiss}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </section>
  );
}
