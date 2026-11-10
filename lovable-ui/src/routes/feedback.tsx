import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { FeedbackHub } from "@/components/feedback";
export const Route = createFileRoute("/feedback")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [{ title: "Beta feedback — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Beta feedback"
      intro="Report a bug, suggest an improvement and vote for the ideas you want most."
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      <FeedbackHub />
    </AuthShell>
  );
}
