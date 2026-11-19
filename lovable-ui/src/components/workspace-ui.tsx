import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
import { Check, Copy, Share2, type LucideIcon } from "lucide-react";
import { Notice } from "./account/ui";
import { Button } from "./ui/button";

/**
 * Shared pieces of the workspace dashboards (Tutor and Learner) and the inbox.
 * Design: warm cream surfaces, a yellow-only glow, solid coral for the main action,
 * Lucide icons. Every number shown comes from the API; nothing is invented.
 */

/** Loading, error-with-retry and ready states for one dashboard section. */
export function SectionData<T>({
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
      <p role="status" className="py-3 text-sm text-muted-foreground">
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

/** A ring that shows how many setup steps are done, around the account photo. */
export function ProgressRing({
  done,
  total,
  children,
}: {
  done: number;
  total: number;
  children: ReactNode;
}) {
  const r = 62,
    c = 2 * Math.PI * r,
    part = total ? Math.min(done, total) / total : 0;
  return (
    <div className="ws-ring">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <defs>
          <linearGradient id="ws-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd977" />
            <stop offset="1" stopColor="#f0a92e" />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} className="ws-ring-track" />
        <circle
          cx="70"
          cy="70"
          r={r}
          className="ws-ring-value"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - part)}
        />
      </svg>
      <div className="ws-ring-inner">{children}</div>
    </div>
  );
}

export type JourneyStep = {
  title: string;
  done: boolean;
  icon: LucideIcon;
  /** Shown under the title: a short note, or a link to the next action. */
  note?: ReactNode;
};
export function JourneyTrack({ label, steps }: { label: string; steps: JourneyStep[] }) {
  const current = steps.findIndex((step) => !step.done);
  const reached = current === -1 ? steps.length - 1 : current;
  const width = steps.length > 1 ? (reached / (steps.length - 1)) * 75 : 0;
  return (
    <div className="ws-track">
      <ol aria-label={label} style={{ ["--ws-progress" as string]: `${width}%` }}>
        {steps.map((step, index) => {
          const Icon = step.done ? Check : step.icon;
          const state = step.done ? "done" : index === current ? "now" : "todo";
          return (
            <li key={step.title} className={`ws-step ws-step-${state}`}>
              <span className="ws-node" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="ws-step-text">
                <b>{step.title}</b>
                <span className="sr-only">{step.done ? " (done)" : ""}</span>
                {step.note && <small>{step.note}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type Tone = "coral" | "butter" | "peach" | "ok";
export function StatTile({
  icon: Icon,
  value,
  label,
  tone = "coral",
  to,
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  tone?: Tone;
  to?:
    | "/connections"
    | "/tutor/requests"
    | "/tutor/listings"
    | "/tutor/evaluations"
    | "/requests"
    | "/saved-tutors";
}) {
  const body = (
    <>
      <span className={`ws-tile ws-tile-${tone}`} aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span>
        <b>{value}</b>
        {label}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="ws-stat">
      {body}
    </Link>
  ) : (
    <div className="ws-stat">{body}</div>
  );
}

export function WsCard({
  title,
  action,
  children,
  id,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const headingId = `${id ?? title.toLowerCase().replace(/[^a-z]+/g, "-")}-title`;
  return (
    <section id={id} className={`ws-card ${className}`} aria-labelledby={headingId}>
      <div className="ws-card-head">
        <h2 id={headingId}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Chip({
  tone = "neutral",
  icon: Icon,
  children,
}: {
  tone?: "ok" | "wait" | "neutral" | "warn";
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span className={`ws-chip ws-chip-${tone}`}>
      {Icon && <Icon aria-hidden="true" className="size-4" />}
      {children}
    </span>
  );
}

/**
 * Shares the Tutor's public profile: the system share sheet where there is one,
 * otherwise the link is copied. The outcome is announced, never assumed.
 */
export function ShareProfileButton({
  url,
  className = "",
  label = "Share my profile",
  tone = "primary",
}: {
  url: string;
  className?: string;
  label?: string;
  tone?: "primary" | "soft";
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  const share = async () => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "My tutor profile", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("Profile link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Could not share. Copy this link: " + url);
    }
  };
  return (
    <>
      <button
        type="button"
        className={`ws-btn ws-btn-${tone}${tone === "soft" ? " ws-btn-sm" : ""} ${className}`}
        onClick={() => void share()}
      >
        <Share2 aria-hidden="true" className="size-[18px]" />
        {label}
      </button>
      <span role="status" className={message ? "ws-toast" : "sr-only"}>
        {message && (
          <>
            <Copy aria-hidden="true" className="size-4" />
            {message}
          </>
        )}
      </span>
    </>
  );
}
