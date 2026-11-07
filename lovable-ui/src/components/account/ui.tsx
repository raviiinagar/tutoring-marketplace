import { accountInitial } from "@/lib/account-photo";
import { AccountAvatar } from "@/components/account-avatar";
import { AdminShell } from "@/components/admin-shell";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  Heart,
  Menu,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api, describeFailure, type Catalogue } from "@/lib/api";
import { TeacherSearchBar } from "@/components/teacher-search-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountSessionKey } from "@/lib/session";
import { WorkspaceNavigation, workspaceLinks } from "@/components/workspace-navigation";
import { TutorWorkspaceNavigation } from "@/components/tutor-workspace-navigation";
const AccountReady = createContext(false);

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-wordmark ${className}`}>
      <span className="brand-tutor">Tutor</span>{" "}
      <span className="brand-marketplace">Marketplace</span>
      <span aria-hidden="true" className="brand-period">
        .
      </span>
    </span>
  );
}

function HeaderSearchDialog({
  onClose,
  returnFocus,
}: {
  onClose: () => void;
  returnFocus: () => void;
}) {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const latest = useRef(0);
  const load = async () => {
    const attempt = ++latest.current;
    setLoading(true);
    setError(undefined);
    const result = await api.catalogue();
    if (attempt !== latest.current) return;
    if (result.ok) setCatalogue(result.data);
    else setError(describeFailure(result.error));
    setLoading(false);
  };
  useEffect(() => {
    void load();
    return () => {
      latest.current++;
    };
  }, []);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="header-search-dialog max-w-3xl rounded-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Find a teacher</DialogTitle>
          <DialogDescription>
            Choose your subject and class location, or learn online.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Loading subjects...
          </p>
        ) : error ? (
          <div role="alert" className="space-y-4">
            <p>{error}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              Retry search options
            </Button>
          </div>
        ) : catalogue ? (
          <TeacherSearchBar
            catalogue={catalogue}
            onSearch={(filters) => {
              onClose();
              void navigate({ to: "/tutors", search: filters });
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function SiteHeader({
  homepage = false,
  accountStyle = false,
}: {
  homepage?: boolean;
  accountStyle?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null),
    searchButton = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 300);
    scroll();
    if (!homepage) return;
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, [homepage]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const resize = () => {
      if (window.innerWidth >= 1024) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("popstate", close);
    window.addEventListener("hashchange", close);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("popstate", close);
      window.removeEventListener("hashchange", close);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: mounted,
    retry: false,
    staleTime: 0,
  });
  const user = session.data?.ok ? session.data.data.user : null;
  const pending = !mounted || session.isPending;
  const teacherPath = user
    ? user.roles.includes("TUTOR")
      ? "/tutor/dashboard"
      : "/tutor"
    : "/auth/signup";
  const teacherHash = "";
  const showSearch = !homepage || scrolled;
  const accountLinks = (
    <>
      <Link to="/account">Dashboard</Link>
      <Link to="/saved-tutors">Saved Tutors</Link>
      <Link to="/requests">My enquiries</Link>
      <Link to="/connections">Messages</Link>
      <Link to="/account/settings">My account</Link>
    </>
  );
  const openSearch = (button: HTMLButtonElement) => {
    searchButton.current = button;
    setOpen(false);
    setSearchOpen(true);
  };
  const searchTrigger = (mobile: boolean) => (
    <button
      type="button"
      aria-label={
        mobile ? "Search for a teacher" : "What would you like to learn? Search for a teacher"
      }
      className={
        mobile
          ? "header-search-trigger header-search-mobile inline-flex size-10 items-center justify-center rounded-full lg:hidden"
          : "header-search-trigger hidden items-center gap-3 rounded-full lg:inline-flex"
      }
      disabled={!mounted}
      onClick={(event) => openSearch(event.currentTarget)}
    >
      {!mobile && <span className="header-search-label">What would you like to learn?</span>}
      <span className="header-search-icon">
        <Search aria-hidden className="size-5" />
      </span>
    </button>
  );
  return (
    <>
      <header className="site-header sticky top-0 z-20 border-b bg-background/95 backdrop-blur-xl">
        <div className="site-header-inner mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <div className="header-brand-search flex min-w-0 items-center gap-6">
            <Link
              to="/"
              aria-label="Tutor Marketplace home"
              className="brand-link min-w-0 rounded-md"
            >
              <BrandWordmark />
            </Link>
            {showSearch && searchTrigger(false)}
          </div>
          <nav
            aria-label="Main navigation"
            className="hidden shrink-0 items-center gap-4 text-sm font-semibold lg:flex"
          >
            <a
              href="/#how-it-works"
              className="header-help inline-flex size-11 items-center justify-center rounded-full"
              aria-label="Help"
            >
              <CircleHelp aria-hidden className="size-5" />
            </a>
            {accountStyle && user ? (
              <Link to="/saved-tutors" aria-label="Saved Tutors" className="reference-header-icon">
                <Heart aria-hidden className="size-5" />
              </Link>
            ) : (
              <Link
                to={teacherPath}
                hash={teacherHash}
                className="header-nav-pill inline-flex min-h-11 items-center rounded-full px-5"
              >
                Give private classes
              </Link>
            )}
            {pending ? (
              <span role="status" className="text-sm text-muted-foreground">
                Checking account...
              </span>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="header-nav-pill h-11 rounded-full border-0 px-5 shadow-none"
                    aria-label={`${accountInitial(user.display_name)} ${accountStyle ? "My account menu" : "My account"}`}
                  >
                    {accountStyle ? (
                      <>
                        <Menu aria-hidden className="size-5" />
                        <AccountAvatar
                          decorative
                          user={user}
                          className="reference-account-initial"
                        />
                      </>
                    ) : (
                      <>
                        <AccountAvatar
                          decorative
                          user={user}
                          className="size-8 rounded-full bg-muted"
                        />{" "}
                        My account
                        <ChevronDown aria-hidden className="size-4" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-48 rounded-xl p-2"
                  onCloseAutoFocus={(event) => {
                    // Preserve the explicit destination after same-page start-teaching navigation.
                    if (document.activeElement?.closest("#roles")) event.preventDefault();
                  }}
                >
                  {workspaceLinks.map((item) => (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link to={item.to}>{item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem asChild>
                    <Link to="/saved-tutors">Saved Tutors</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/requests">My enquiries</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={teacherPath} hash={teacherHash}>
                      Give private classes
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                to="/auth/signin"
                className="header-nav-pill inline-flex min-h-11 items-center rounded-full px-5"
              >
                Sign in
              </Link>
            )}
          </nav>
          <div className="header-mobile-actions flex shrink-0 items-center gap-1 lg:hidden">
            {showSearch && searchTrigger(true)}
            <Button
              ref={menuButton}
              disabled={!mounted}
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={
                open
                  ? "Close menu"
                  : user
                    ? `${accountInitial(user.display_name)} Open menu`
                    : "Open menu"
              }
              aria-expanded={open}
              aria-controls={open ? "mobile-navigation" : undefined}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? (
                <X />
              ) : user ? (
                <AccountAvatar decorative user={user} className="reference-account-initial" />
              ) : (
                <Menu />
              )}
            </Button>
          </div>
        </div>
        {open && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="header-mobile-menu absolute inset-x-0 top-full grid max-h-[calc(100dvh-80px)] gap-4 overflow-y-auto border-b bg-background px-5 py-6 shadow-sm lg:hidden"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {!pending && !user && (
              <div className="header-mobile-auth grid gap-3 border-t pt-5">
                <Link
                  className="header-mobile-signin rounded-full bg-primary px-5 py-3 text-center font-semibold text-primary-foreground"
                  to="/auth/signin"
                >
                  Sign in
                </Link>
                <Link
                  className="rounded-full border px-5 py-3 text-center font-semibold"
                  to="/auth/signup"
                >
                  Create an account
                </Link>
              </div>
            )}
            <Link to="/tutors">Find Tutors</Link>
            <a href="/#subjects">Explore subjects</a>
            <a href="/#how-it-works">Help</a>
            <Link to={teacherPath} hash={teacherHash}>
              Give private classes
            </Link>
            {pending ? (
              <span role="status">Checking account...</span>
            ) : user ? (
              accountLinks
            ) : (
              <>
                <Link to="/saved-tutors">Saved Tutors</Link>
              </>
            )}
          </nav>
        )}
      </header>
      {searchOpen && (
        <HeaderSearchDialog
          onClose={() => setSearchOpen(false)}
          returnFocus={() => {
            if (searchButton.current?.isConnected) searchButton.current.focus();
          }}
        />
      )}
    </>
  );
}

export function AuthShell({
  title,
  intro,
  children,
  footer,
  wide = false,
  dashboard = false,
  reference = false,
  fullWidth = false,
  teachingWorkspace = false,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  dashboard?: boolean;
  reference?: boolean;
  fullWidth?: boolean;
  teachingWorkspace?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const tutorWorkspace =
    teachingWorkspace ||
    (ready &&
      (window.location.pathname === "/tutor" || window.location.pathname.startsWith("/tutor/")));
  const referenceLayout = reference || tutorWorkspace;
  if (ready && window.location.pathname.startsWith("/staff"))
    return (
      <AccountReady.Provider value={ready}>
        <AdminShell title={title} intro={intro} footer={footer}>
          {children}
        </AdminShell>
      </AccountReady.Provider>
    );
  return (
    <AccountReady.Provider value={ready}>
      <div className={referenceLayout ? "reference-account min-h-screen" : "min-h-screen"}>
        {referenceLayout ? (
          <div className="reference-header-group">
            <SiteHeader accountStyle />
            <div className="reference-workspace-bar">
              <div className="mx-auto max-w-[1200px] px-5">
                {tutorWorkspace ? <TutorWorkspaceNavigation /> : <WorkspaceNavigation />}
              </div>
            </div>
          </div>
        ) : (
          <SiteHeader />
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className={`account-workspace mx-auto w-full ${referenceLayout && fullWidth ? "max-w-none" : referenceLayout ? "max-w-[1240px]" : dashboard ? "max-w-6xl" : wide ? "max-w-4xl" : "max-w-2xl"} px-5 pb-16 pt-6 sm:pt-10`}
        >
          {ready &&
            !referenceLayout &&
            !window.location.pathname.startsWith("/auth/") &&
            (window.location.pathname === "/tutor" ||
            window.location.pathname.startsWith("/tutor/") ? (
              <TutorWorkspaceNavigation />
            ) : (
              <WorkspaceNavigation />
            ))}
          <div
            className={
              dashboard || referenceLayout
                ? "animate-rise account-content"
                : "card-surface animate-rise account-content"
            }
          >
            <h1
              className={reference ? "sr-only" : "break-words text-3xl font-semibold sm:text-4xl"}
            >
              {title}
            </h1>
            {intro && <div className="mt-3 text-muted-foreground">{intro}</div>}
            <div className={reference ? "" : "mt-8"}>{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </main>
      </div>
    </AccountReady.Provider>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
};

export function Field({ label, error, hint, id, ...rest }: FieldProps) {
  const ready = useContext(AccountReady);
  const [visible, setVisible] = useState(false);
  const password = rest.type === "password";
  const auto = useId();
  const fid = id ?? auto;
  const errId = `${fid}-error`;
  const hintId = `${fid}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="block text-sm font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="relative">
        <input
          id={fid}
          className={password ? "input pr-14" : "input"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
          type={password && visible ? "text" : rest.type}
          disabled={rest.disabled || !ready}
        />
        {password && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-controls={fid}
            aria-pressed={visible}
            disabled={rest.disabled || !ready}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? (
              <EyeOff aria-hidden className="size-5" />
            ) : (
              <Eye aria-hidden className="size-5" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={errId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  loading,
  children,
  loadingText,
  disabled = false,
}: {
  loading: boolean;
  children: ReactNode;
  loadingText: string;
  disabled?: boolean;
}) {
  const ready = useContext(AccountReady);
  return (
    <Button
      type="submit"
      className="min-h-12 w-full text-base font-semibold"
      disabled={disabled || loading || !ready}
      aria-disabled={disabled || loading || !ready}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"
        />
      )}
      {loading ? loadingText : children}
    </Button>
  );
}

type Tone = "error" | "success" | "info";
const toneClass: Record<Tone, string> = {
  error: "border-destructive/40 bg-destructive-soft text-destructive",
  success: "border-success/30 bg-success-soft text-success",
  info: "border-coral/40 bg-coral-soft text-foreground",
};

/** Announces itself to assistive tech: errors assertively, others politely. */
export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${toneClass[tone]}`}
    >
      {children}
    </div>
  );
}

/** Wraps an async action so it can never run twice at once. */
export function useSingleFlight() {
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      await fn();
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);
  return { loading, run };
}
