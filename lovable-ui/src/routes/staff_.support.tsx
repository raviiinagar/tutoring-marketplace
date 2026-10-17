import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { SupportOperations } from "@/components/support";
export const Route = createFileRoute("/staff_/support")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Support case workspace — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  return (
    <AuthShell
      title="Support case workspace"
      footer={
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
      }
    >
      <SupportOperations />
    </AuthShell>
  );
}
