import { Link } from "@tanstack/react-router";
import { useTeachingPresence } from "@/lib/teaching-presence";

export const workspaceLinks = [
  { to: "/account", label: "Dashboard" },
  { to: "/connections", label: "My messages" },
  { to: "/account/settings", label: "My Account" },
] as const;

const linkClass = "reference-workspace-link";
const activeProps = {
  "aria-current": "page",
  className: "reference-workspace-active",
} as const;

/**
 * The learner workspace navigation. Once an account owns at least one ad
 * (a private draft counts), the teaching tabs join it so the owner can always
 * find their ads again. That only reveals the owner's own workspace: it never
 * makes an ad public. Tutors also get a plain switch into the teaching view.
 */
export function WorkspaceNavigation() {
  const { isTutor, hasAds } = useTeachingPresence();
  return (
    <nav aria-label="Workspace navigation" className="reference-workspace-nav">
      <Link
        to="/account"
        activeOptions={{ exact: true }}
        activeProps={activeProps}
        className={linkClass}
      >
        Dashboard
      </Link>
      <Link to="/connections" activeProps={activeProps} className={linkClass}>
        My messages
      </Link>
      {hasAds && (
        <>
          <Link to="/tutor/listings" activeProps={activeProps} className={linkClass}>
            My ads
          </Link>
          <Link to="/tutor/evaluations" activeProps={activeProps} className={linkClass}>
            Evaluations
          </Link>
        </>
      )}
      <Link to="/account/settings" activeProps={activeProps} className={linkClass}>
        My Account
      </Link>
      {isTutor && (
        <Link to="/tutor/dashboard" className={`${linkClass} reference-workspace-switch`}>
          Switch to teaching
        </Link>
      )}
    </nav>
  );
}
