import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { NotificationOperations } from "@/components/notification-operations";
export const Route = createFileRoute("/staff_/notifications")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Notification delivery — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Notification delivery"
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <NotificationOperations />
    </AuthShell>
  );
}
