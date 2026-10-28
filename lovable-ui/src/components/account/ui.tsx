import { Link } from "@tanstack/react-router";
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

import { ArrowUpRight, Eye, EyeOff, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { accountSessionKey } from "@/lib/session";
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

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const session = useQuery({
    queryKey: accountSessionKey,
    queryFn: api.me,
    enabled: mounted,
    retry: false,
    staleTime: 0,
  });
  const user = session.data?.ok ? session.data.data.user : null;
  const accountNavigation = user ? (
    <>
      <Link to="/requests" className="hover:text-coral-strong">
        My enquiries
      </Link>
      <Button
        asChild
        variant="outline"
        className="h-10 rounded-full border-foreground/15 px-5 font-semibold shadow-none"
      >
        <Link to="/account">
          My account <ArrowUpRight />
        </Link>
      </Button>
    </>
  ) : mounted && !session.isPending ? (
    <>
      <Link to="/auth/signin" className="hover:text-coral-strong">
        Sign in
      </Link>
      <Button
        asChild
        variant="outline"
        className="h-10 rounded-full border-foreground/15 px-5 font-semibold shadow-none"
      >
        <Link to="/auth/signup">
          Join us <ArrowUpRight />
        </Link>
      </Button>
    </>
  ) : (
    <span role="status" className="text-sm text-muted-foreground">
      Checking account…
    </span>
  );
  return (
    <header className="site-header sticky top-0 z-20 border-b bg-background/90 backdrop-blur-xl">
      <div role="status" className="border-b bg-coral-soft px-5 py-2 text-center text-sm font-semibold">Payment sandbox · Fictional accounts only · No real money</div>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 lg:flex lg:justify-between lg:px-8">
        <Link to="/" aria-label="Tutor Marketplace home" className="brand-link min-w-0 rounded-md">
          <BrandWordmark />
        </Link>
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-6 text-sm font-medium lg:flex"
        >
          <Link to="/tutors" className="hover:text-coral-strong">
            Find Tutors
          </Link>
          <a href="/#tutors" className="hover:text-coral-strong">
            Become a tutor
          </a>
          {accountNavigation}
        </nav>
        <Button
          ref={menuButton}
          disabled={!mounted}
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={open ? "mobile-navigation" : undefined}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full grid gap-4 border-b bg-background px-5 py-6 shadow-sm lg:hidden"
          onClick={() => setOpen(false)}
        >
          <Link to="/tutors">Find Tutors</Link>
          <a href="/#subjects">Explore subjects</a>
          <a href="/#tutors">Become a tutor</a>
          {accountNavigation}
        </nav>
      )}
    </header>
  );
}

export function AuthShell({
  title,
  intro,
  children,
  footer,
  wide = false,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <AccountReady.Provider value={ready}>
      <div className="min-h-screen">
        <SiteHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className={`account-workspace mx-auto w-full ${wide ? "max-w-4xl" : "max-w-2xl"} px-5 pb-16 pt-6 sm:pt-10`}
        >
          {ready && !window.location.pathname.startsWith("/auth/") && (
            <nav
              aria-label="Workspace navigation"
              className="workspace-nav mb-6 flex flex-wrap gap-2 text-sm"
            >
              <Link
                to="/account"
                activeOptions={{ exact: true }}
                activeProps={{ "aria-current": "page", className: "workspace-active" }}
              >
                Overview
              </Link>
              <Link
                to="/tutors"
                activeProps={{ "aria-current": "page", className: "workspace-active" }}
              >
                Find Tutors
              </Link>
              <Link
                to="/requests"
                activeProps={{ "aria-current": "page", className: "workspace-active" }}
              >
                My enquiries
              </Link>
              <Link
                to="/connections"
                activeProps={{ "aria-current": "page", className: "workspace-active" }}
              >
                Connections
              </Link>
              <Link
                to="/support"
                activeProps={{ "aria-current": "page", className: "workspace-active" }}
              >
                Get help
              </Link>
            </nav>
          )}
          <div className="card-surface animate-rise account-content">
            <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
            {intro && <div className="mt-3 text-muted-foreground">{intro}</div>}
            <div className="mt-8">{children}</div>
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
