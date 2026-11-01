import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  ShieldCheck,
  Image,
  Users,
  ClipboardCheck,
  MessagesSquare,
  LockKeyhole,
  GraduationCap,
} from "lucide-react";
const tools = [
  {
    to: "/staff/tutors",
    title: "Tutor evidence",
    description: "Review identity, profile and submitted experience.",
    icon: GraduationCap,
  },
  {
    to: "/staff/listings",
    title: "Teaching offers",
    description: "Review subjects, rates and teaching offer details.",
    icon: BookOpen,
  },
  {
    to: "/staff/photos",
    title: "Portrait reviews",
    description: "Review Tutor photos before public display.",
    icon: Image,
  },
  {
    to: "/staff/guardians",
    title: "Guardian reviews",
    description: "Check submitted adult and Guardian evidence.",
    icon: Users,
  },
  {
    to: "/staff/safety",
    title: "Safety & reports",
    description: "Investigate reports and apply permitted safety decisions.",
    icon: ShieldCheck,
  },
  {
    to: "/staff/reviews",
    title: "Review moderation",
    description: "Review connection-linked feedback for publication.",
    icon: ClipboardCheck,
  },
  {
    to: "/staff/support",
    title: "Support & appeals",
    description: "Handle requests and appeals within your assigned areas.",
    icon: MessagesSquare,
  },
  {
    to: "/staff/privacy",
    title: "Privacy requests",
    description: "Handle identity-checked privacy requests and holds.",
    icon: LockKeyhole,
  },
] as const;
export function AdminReviewWorkspace() {
  return (
    <section className="mt-6" aria-label="Review workspace">
      <h2 className="text-xl font-semibold">Your review workspace</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose an area to see pending work and review submissions.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map(({ to, title, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="rounded-2xl border bg-card p-5 transition-colors hover:bg-secondary"
          >
            <div className="flex items-center justify-between">
              <Icon aria-hidden className="size-6 text-coral-strong" />
              <ArrowUpRight aria-hidden className="size-4" />
            </div>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
