import { createFileRoute } from "@tanstack/react-router";
import { TutorOnboarding } from "@/components/tutor-onboarding";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
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
  // No role has to be chosen before teaching. Any signed-in account can open
  // the teaching workspace; the Tutor role is recorded when the first private
  // draft is saved, and nothing becomes public until an explicit publication.
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
