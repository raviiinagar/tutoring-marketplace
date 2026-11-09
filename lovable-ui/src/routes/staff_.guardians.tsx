import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, Notice } from "@/components/account/ui";

// ADR 0015 retired Guardian verification. The address stays so an old bookmark
// explains what happened instead of showing a missing page.
export const Route = createFileRoute("/staff_/guardians")({
  ssr: false,
  component: GuardianReviewsRetired,
  head: () => ({
    meta: [
      { title: "Guardian reviews retired — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function GuardianReviewsRetired() {
  return (
    <AuthShell
      title="Guardian reviews"
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <Notice tone="info">
        Child profiles and Guardian verification are no longer offered, so there is nothing to
        review here. Parents book classes for their child from their own adult account.
      </Notice>
    </AuthShell>
  );
}
