import { useEffect, useState } from "react";
import { api, assetUrl } from "@/lib/api";
import { Notice } from "@/components/account/ui";

const messages: Record<string, string> = {
  failed: "Google sign-in didn't work. Please try again.",
  cancelled: "Google sign-in was cancelled.",
  account:
    "We couldn't sign you in with that Google account. Use your email and password instead, or ask Support for help.",
  unavailable: "Google sign-in isn't available right now. Use your email and password instead.",
};

/** The message for a ?google= outcome from the sign-in callback (ADR0020). */
export function GoogleSignInNotice({ outcome }: { outcome?: string | undefined }) {
  const message = outcome ? messages[outcome] : undefined;
  return message ? (
    <Notice tone={outcome === "cancelled" ? "info" : "error"}>{message}</Notice>
  ) : null;
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * "Continue with Google". A full-page navigation to the API, which sends the browser to Google
 * and back; it appears only when the server has Google sign-in configured.
 */
export function GoogleSignInButton({
  returnTo,
  divider = "or",
}: {
  returnTo?: string | undefined;
  /** The words between the Google button and the email form. */
  divider?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.authProviders().then((result) => {
      if (alive) setEnabled(result.ok && result.data.google);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!enabled) return null;
  const href = assetUrl(
    "/v1/auth/google/start" + (returnTo ? "?return_to=" + encodeURIComponent(returnTo) : ""),
  );
  return (
    <div className="space-y-4">
      <a
        href={href}
        className="flex min-h-[50px] w-full items-center justify-center gap-3 rounded-full border-[1.5px] bg-background px-5 font-semibold hover:bg-secondary/60"
      >
        <GoogleMark />
        Continue with Google
      </a>
      <p className="flex items-center gap-3 text-[13px] text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        {divider}
      </p>
    </div>
  );
}
