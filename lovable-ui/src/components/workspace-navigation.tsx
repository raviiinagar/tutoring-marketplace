import { Link } from "@tanstack/react-router";

export const workspaceLinks = [
  { to: "/account", label: "Dashboard" },
  { to: "/connections", label: "My messages" },
  { to: "/account/settings", label: "My Account" },
] as const;

export function WorkspaceNavigation() {
  return (
    <nav aria-label="Workspace navigation" className="reference-workspace-nav">
      {workspaceLinks.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/account" }}
          activeProps={{
            "aria-current": "page",
            className: "reference-workspace-active",
          }}
          className="reference-workspace-link"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
