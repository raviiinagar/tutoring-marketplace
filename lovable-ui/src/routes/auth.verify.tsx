import { Button } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, describeFailure } from "@/lib/api";
import { TOKEN_RE } from "@/lib/validation";
import { AuthShell, Notice, useSingleFlight } from "@/components/account/ui";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Verify email — Tutor Marketplace" },
      { name: "description", content: "Confirm your email address for Tutor Marketplace." },
      { property: "og:title", content: "Verify email — Tutor Marketplace" },
      { property: "og:description", content: "Confirm your email address." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Verify,
});

type State = "reading" | "ready" | "missing" | "invalid" | "verified";

/** Pulls `token` out of a URL fragment like `#token=abc`. */
export function readFragmentToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("token");
}

function Verify() {
  const tokenRef = useRef<string | null>(null);
  const [state, setState] = useState<State>("reading");
  const [error, setError] = useState<string>();
  const { loading, run } = useSingleFlight();

  useEffect(() => {
    const found = readFragmentToken(window.location.hash);
    if (found !== null) {
      tokenRef.current = found;
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    // Strict Mode re-runs this after the fragment is gone; keep the token captured on the first run.
    const t = tokenRef.current;
    if (t === null) setState("missing");
    else setState(TOKEN_RE.test(t) ? "ready" : "invalid");
  }, []);

  const verify = () =>
    run(async () => {
      const t = tokenRef.current;
      if (!t) return;
      setError(undefined);
      const res = await api.verifyEmail(t);
      if (res.ok) {
        tokenRef.current = null;
        setState("verified");
      } else if (res.error.kind === "http" && (res.error.code === "INVALID_OR_EXPIRED_TOKEN" || res.error.code === "VALIDATION_ERROR")) {
        tokenRef.current = null;
        setState("invalid");
      } else setError(describeFailure(res.error));
    });

  if (state === "verified")
    return (
      <AuthShell title="Email verified">
        <Notice tone="success">Your email address is confirmed. You can now sign in.</Notice>
        <Link to="/auth/signin" className="btn-primary mt-6 w-full">Sign in</Link>
      </AuthShell>
    );

  if (state === "invalid")
    return (
      <AuthShell title="This link can't be used">
        <Notice tone="error">The verification link is invalid, has expired, or has already been used.</Notice>
        <Link to="/auth/check-email" className="btn-primary mt-6 w-full">Get a new link</Link>
      </AuthShell>
    );

  if (state === "missing")
    return (
      <AuthShell title="Verification link missing">
        <p className="text-muted-foreground">
          Open this page using the link in your verification email. If the link was cut off or you can't find the email, request a new one.
        </p>
        <Link to="/auth/check-email" className="btn-primary mt-6 w-full">Request a new link</Link>
      </AuthShell>
    );

  return (
    <AuthShell title="Verify your email" intro={<p>Press the button below to confirm your email address.</p>}>
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="button" className="min-h-12 w-full" onClick={verify} disabled={loading || state !== "ready"}>
          {loading ? "Verifying…" : "Verify email"}
        </Button>
      </div>
    </AuthShell>
  );
}
