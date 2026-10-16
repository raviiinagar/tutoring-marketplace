import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { ReviewModeration } from "@/components/review-moderation";
export const Route = createFileRoute("/staff_/reviews")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Review moderation — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Review moderation"
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <ReviewModeration />
    </AuthShell>
  );
}
