import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { SupportDesk } from "@/components/support";
export const Route = createFileRoute("/support")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Support and appeals — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Support and appeals"
      intro="A clear record of your questions, responses and appeal outcomes."
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      <SupportDesk />
    </AuthShell>
  );
}
