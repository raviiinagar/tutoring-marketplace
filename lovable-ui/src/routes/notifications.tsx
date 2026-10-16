import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { NotificationSettings } from "@/components/notification-settings";
export const Route = createFileRoute("/notifications")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [{ title: "Notifications — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Notifications"
      intro="Choose how you hear from us."
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      <NotificationSettings />
    </AuthShell>
  );
}
