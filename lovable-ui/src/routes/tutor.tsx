import { createFileRoute } from "@tanstack/react-router";
import { TutorOnboarding } from "@/components/tutor-onboarding";
import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTutorAccount } from "@/lib/tutor-dashboard";
import { AuthShell, Notice } from "@/components/account/ui";
import { Button } from "@/components/ui/button";
function TutorProfileRoute() {
  const account = useTutorAccount(),
    navigate = useNavigate();
  useEffect(() => {
    if (account.anonymous) void navigate({ to: "/auth/signin", replace: true });
  }, [account.anonymous, navigate]);
  if (!account.user)
    return (
      <AuthShell title="Your Tutor profile">
        {account.error ? (
          <>
            <Notice tone="error">{account.error}</Notice>
            <Button onClick={() => void account.session.refetch()}>Retry account</Button>
          </>
        ) : (
          <p role="status">Loading your account…</p>
        )}
      </AuthShell>
    );
  if (!account.user.roles.includes("TUTOR"))
    return (
      <AuthShell title="Start teaching">
        <p>Choose the Tutor role in your account settings to create a teaching profile.</p>
        <Link className="link" to="/account/settings" hash="roles">
          Choose your account roles
        </Link>
      </AuthShell>
    );
  return <TutorOnboarding key={account.user.id} />;
}
export const Route = createFileRoute("/tutor")({
  ssr: false,
  component: TutorProfileRoute,
  head: () => ({
    meta: [
      { title: "Tutor onboarding — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
