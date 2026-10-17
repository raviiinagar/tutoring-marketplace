import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { PrivacyOperations } from "@/components/privacy";

export const Route = createFileRoute("/staff_/privacy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Privacy operations | Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});
function Page() {
  return (
    <AuthShell
      title="Privacy operations"
      intro="Verified requests, clear outcomes and purpose-limited retention."
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <PrivacyOperations />
    </AuthShell>
  );
}
