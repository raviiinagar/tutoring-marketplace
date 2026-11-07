import { Link } from "@tanstack/react-router";
const links = [
  { to: "/tutor/dashboard", label: "Dashboard" },
  { to: "/connections", label: "My messages" },
  { to: "/tutor/listings", label: "My ads" },
  { to: "/tutor/evaluations", label: "Evaluations" },
  { to: "/account/settings", label: "My account" },
] as const;
export function TutorWorkspaceNavigation() {
  return (
    <nav aria-label="Teaching workspace navigation" className="reference-workspace-nav">
      {links.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          activeProps={{
            "aria-current": "page",
            className: "reference-workspace-active",
          }}
          className="reference-workspace-link"
        >
          {item.label}
        </Link>
      ))}
      <Link to="/account" className="reference-workspace-link reference-workspace-switch">
        Switch to learning
      </Link>
    </nav>
  );
}
