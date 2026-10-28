import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  LayoutDashboard,
  ShieldCheck,
  Users,
  BookOpen,
  Image,
  MessagesSquare,
  Wallet,
  BarChart3,
  Activity,
  Bell,
  LockKeyhole,
  Library,
  Menu,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import { api, type StaffScope } from "@/lib/api";
const items = [
  { group: "Workspace", label: "Overview", to: "/staff", icon: LayoutDashboard },
  {
    group: "Trust & safety",
    label: "Tutor evidence",
    to: "/staff/tutors",
    icon: GraduationCap,
    scope: "TRUST",
  },
  {
    group: "Trust & safety",
    label: "Teaching offers",
    to: "/staff/listings",
    icon: BookOpen,
    scope: "TRUST",
  },
  {
    group: "Trust & safety",
    label: "Portrait reviews",
    to: "/staff/photos",
    icon: Image,
    scope: "TRUST",
  },
  {
    group: "Trust & safety",
    label: "Guardian reviews",
    to: "/staff/guardians",
    icon: Users,
    scope: "TRUST",
  },
  {
    group: "Trust & safety",
    label: "Safety & reports",
    to: "/staff/safety",
    icon: ShieldCheck,
    scope: "TRUST",
  },
  {
    group: "Trust & safety",
    label: "Review moderation",
    to: "/staff/reviews",
    icon: ClipboardCheck,
    scope: "TRUST",
  },
  { group: "Service", label: "Support & appeals", to: "/staff/support", icon: MessagesSquare },
  { group: "Service", label: "Privacy requests", to: "/staff/privacy", icon: LockKeyhole },
  {
    group: "Finance & growth",
    label: "Payments & coupons",
    to: "/staff/finance",
    icon: Wallet,
    scope: "FINANCE",
  },
  {
    group: "Finance & growth",
    label: "Marketplace reports",
    to: "/staff/metrics",
    icon: BarChart3,
    scope: "FINANCE",
  },
  {
    group: "Platform",
    label: "Operations",
    to: "/staff/operations",
    icon: Activity,
    any: ["SUPPORT", "FINANCE"],
  },
  {
    group: "Platform",
    label: "Notifications",
    to: "/staff/notifications",
    icon: Bell,
    scope: "SUPPORT",
  },
  { group: "Platform", label: "Catalogue", to: "/staff/catalogue", icon: Library, scope: "TRUST" },
] as const;
export function AdminShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => setMounted(true), []);
  const access = useQuery({
    queryKey: ["admin-staff-access"],
    queryFn: api.staffAccess,
    enabled: mounted,
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const allowed = access.data?.ok && access.data.data.authenticated ? access.data.data : null;
  const available = items.filter(
    (item) =>
      item.to === "/staff" ||
      (allowed &&
        (!("scope" in item) || allowed.scopes.includes(item.scope)) &&
        (!("any" in item) || item.any.some((s) => allowed.scopes.includes(s as StaffScope)))),
  );
  const nav = () => {
    let group = "";
    return available.map((item) => {
      const heading = group !== item.group;
      group = item.group;
      const Icon = item.icon;
      return (
        <div key={item.to}>
          {heading && <p className="admin-nav-group">{item.group}</p>}
          <Link
            to={item.to}
            activeOptions={{ exact: true }}
            activeProps={{ className: "admin-nav-active", "aria-current": "page" }}
            className="admin-nav-link"
          >
            <Icon aria-hidden size={18} />
            {item.label}
          </Link>
        </div>
      );
    });
  };
  return (
    <div className="admin-workspace">
      <aside className="admin-sidebar">
        <Link to="/staff" className="admin-brand">
          <span className="admin-brand-icon">
            <GraduationCap aria-hidden size={23} />
          </span>
          <span>
            Tutor Marketplace<small>ADMIN WORKSPACE</small>
          </span>
        </Link>
        <nav aria-label="Admin navigation" className="admin-nav">
          {nav()}
        </nav>
        <a className="admin-site-link" href="/" target="_blank" rel="noopener noreferrer">
          View marketplace
          <ArrowUpRight aria-hidden size={16} />
        </a>
        <p className="admin-secure">
          <LockKeyhole aria-hidden size={14} /> Protected by staff MFA
        </p>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div className="flex items-center gap-3">
            <details className="admin-mobile-menu">
              <summary aria-label="Open admin navigation">
                <Menu size={22} />
              </summary>
              <nav aria-label="Mobile admin navigation">{nav()}</nav>
            </details>
            <span className="admin-breadcrumb">
              Workspace <span>/</span> <strong>{title}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="admin-access-pill">
              <span className={allowed ? "admin-dot" : "admin-dot-muted"} />
              {allowed ? "Staff access verified" : "Verify staff access"}
            </div>
            {allowed && (
              <button
                type="button"
                className="admin-lock-button"
                disabled={locking}
                onClick={async () => {
                  setLocking(true);
                  setLockError(false);
                  const result = await api.staffSignOut();
                  if (result.ok) {
                    await queryClient.invalidateQueries({ queryKey: ["admin-staff-access"] });
                    window.location.assign("/staff");
                  } else {
                    setLockError(true);
                    setLocking(false);
                  }
                }}
              >
                <LockKeyhole aria-hidden size={14} />
                {locking ? "Locking…" : "Lock staff access"}
              </button>
            )}
            {lockError && (
              <span role="alert" className="text-xs text-destructive">
                Could not lock. Try again.
              </span>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="admin-page">
          <div className="admin-page-heading">
            <p className="admin-eyebrow">TUTOR MARKETPLACE · ADMIN</p>
            <h1>{title}</h1>
            {intro && <div className="admin-intro">{intro}</div>}
          </div>
          <div className="admin-content">{children}</div>
          {footer && <footer className="admin-page-footer">{footer}</footer>}
        </main>
      </div>
    </div>
  );
}
