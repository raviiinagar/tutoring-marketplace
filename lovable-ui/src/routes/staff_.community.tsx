import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { CommunityOperations } from "@/components/community-staff";
export const Route = createFileRoute("/staff_/community")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Community management — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Community management"
      intro="Review reported messages, mute members and manage channels. Trust scope with MFA."
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <CommunityOperations />
    </AuthShell>
  );
}
