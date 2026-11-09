import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { FeedbackOperations } from "@/components/feedback";
export const Route = createFileRoute("/staff_/feedback")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Feedback management — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Feedback management"
      intro="Triage beta bugs, suggestions and feature requests. Every opening and action is recorded with your reason."
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <FeedbackOperations />
    </AuthShell>
  );
}
