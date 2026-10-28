import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { OperationsDesk } from "@/components/operations";
export const Route = createFileRoute("/staff_/operations")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Operations and safe recovery | Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});
function Page() {
  return (
    <AuthShell
      wide
      title="Operations & recovery"
      intro="Monitor workers, inspect alerts and recover failed work."
    >
      <OperationsDesk />
    </AuthShell>
  );
}
