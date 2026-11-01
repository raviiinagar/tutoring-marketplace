import { createFileRoute } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { AdminTeamManager } from "@/components/admin-team";
export const Route = createFileRoute("/staff_/admins")({
  ssr: false,
  component: () => (
    <AuthShell
      title="Manage admins"
      intro="Grant and revoke review-team access from your Super Admin account."
    >
      <AdminTeamManager />
    </AuthShell>
  ),
  head: () => ({
    meta: [{ title: "Manage admins — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
