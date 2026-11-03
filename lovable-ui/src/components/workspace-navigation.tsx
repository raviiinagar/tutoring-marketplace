import { Link } from "@tanstack/react-router";

export const workspaceLinks = [
  { to: "/account", label: "Dashboard" },
  { to: "/requests", label: "My enquiries" },
  { to: "/connections", label: "Messages" },
  { to: "/saved-tutors", label: "Saved Tutors" },
  { to: "/account/settings", label: "My account" },
] as const;

export function WorkspaceNavigation() {
  return (
    <nav
      aria-label="Workspace navigation"
      className="mb-7 flex flex-wrap gap-1 border-b pb-3 text-sm"
    >
      {workspaceLinks.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/account" }}
          activeProps={{
            "aria-current": "page",
            className: "bg-amber-50 text-amber-950 ring-1 ring-amber-200",
          }}
          className="inline-flex min-h-11 items-center rounded-full px-4 font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
