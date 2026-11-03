import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/account/ui";
import { TutorPortrait } from "@/components/tutor-portrait";

export function TutorProfileLayout({
  name,
  photoUrl,
  title,
  subjects,
  actions,
  summary,
  navigation,
  children,
}: {
  name: string;
  photoUrl?: string | null | undefined;
  title: string;
  subjects: string[];
  actions?: ReactNode;
  summary: ReactNode;
  navigation: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pt-9"
      >
        <Link
          to="/tutors"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to Tutor search
        </Link>
        <div className="mt-7 grid min-w-0 gap-x-14 gap-y-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <header className="row-start-2 min-w-0 lg:col-start-1 lg:row-start-1">
            <div className="mb-5 flex flex-wrap gap-2">
              {subjects.map((subject, index) => (
                <span
                  key={index}
                  className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950"
                >
                  {subject}
                </span>
              ))}
            </div>
            <h1 className="break-words font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.7rem]">
              {title}
            </h1>
            <nav
              aria-label="Tutor profile sections"
              className="mt-7 flex flex-wrap gap-x-5 gap-y-3 border-b pb-4 text-sm font-medium"
            >
              {navigation.map((item) => (
                <a
                  key={item.id}
                  href={"#" + item.id}
                  className="underline-offset-4 hover:underline"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </header>
          <aside
            aria-label={`${name}'s Tutor summary`}
            className="row-start-1 min-w-0 rounded-[2rem] border border-amber-100 bg-gradient-to-b from-amber-50/80 to-card p-6 shadow-sm sm:p-7 lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          >
            <div className="relative mx-auto mb-5 aspect-[4/5] w-full max-w-64 overflow-hidden rounded-3xl bg-amber-100/70">
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center font-display text-6xl font-semibold text-amber-900/50"
              >
                {name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <TutorPortrait
                url={photoUrl ?? undefined}
                name={name}
                priority
                className="relative h-full w-full object-cover object-top"
              />
            </div>
            <p className="break-words text-center font-display text-2xl font-semibold">{name}</p>
            {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
            <div className="mt-6 space-y-4 border-t border-amber-200/60 pt-5">{summary}</div>
          </aside>
          <div className="row-start-3 min-w-0 space-y-9 lg:col-start-1 lg:row-start-2">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function IdentityReviewNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-amber-50 p-5">
      <p className="flex items-center gap-2 font-semibold">
        <ShieldCheck aria-hidden className="size-5 text-amber-800" />
        {label}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
