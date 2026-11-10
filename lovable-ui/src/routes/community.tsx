import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { CommunityHub } from "@/components/community";
export const Route = createFileRoute("/community")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [{ title: "Community — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Community"
      intro="Chat with other members and the team while we build the platform."
      dashboard
      footer={
        <Link to="/feedback" className="link">
          Found a bug? Send beta feedback
        </Link>
      }
    >
      <CommunityHub />
    </AuthShell>
  );
}
