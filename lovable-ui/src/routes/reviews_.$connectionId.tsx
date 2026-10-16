import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { ReviewForm } from "@/components/reviews";
export const Route = createFileRoute("/reviews_/$connectionId")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Review your Tutor — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  const { connectionId } = Route.useParams();
  return (
    <AuthShell
      title="Review your Tutor"
      footer={
        <Link to="/reviews" className="link">
          My reviews and moderation outcomes
        </Link>
      }
    >
      <ReviewForm connectionId={connectionId} />
    </AuthShell>
  );
}
