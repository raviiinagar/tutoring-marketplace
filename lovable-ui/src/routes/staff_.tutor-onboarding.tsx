import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { TutorOnboardingOperations } from "@/components/assisted-onboarding-staff";
export const Route = createFileRoute("/staff_/tutor-onboarding")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Tutor onboarding — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Tutor onboarding"
      intro="Set up and publish profiles for Tutors who sent their details to the team."
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <TutorOnboardingOperations />
    </AuthShell>
  );
}
