import { Link } from "@tanstack/react-router";
const links = [
  { to: "/tutor/dashboard", label: "Tutor dashboard" },
  { to: "/tutor", label: "Profile & identity" },
  { to: "/tutor/listings", label: "Teaching offers" },
  { to: "/tutor/requests", label: "Incoming enquiries" },
  { to: "/account", label: "Learning dashboard" },
  { to: "/account/settings", label: "My account" },
] as const;
export function TutorWorkspaceNavigation() {
  return (
    <nav
      aria-label="Teaching workspace navigation"
      className="mb-7 flex flex-wrap gap-1 border-b pb-3 text-sm"
    >
      {links.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === "/tutor" || item.to === "/account" }}
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
