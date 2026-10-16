import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { MyReviews } from "@/components/reviews";
export const Route = createFileRoute("/reviews")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [{ title: "My reviews — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
function Page() {
  return (
    <AuthShell
      title="My reviews"
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      <MyReviews />
    </AuthShell>
  );
}
