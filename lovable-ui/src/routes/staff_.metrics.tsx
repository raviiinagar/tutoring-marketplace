import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { MarketplaceMetricsDesk } from "@/components/marketplace-metrics";
export const Route = createFileRoute("/staff_/metrics")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Marketplace value | Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});
function Page() {
  return (
    <AuthShell
      wide
      title="Marketplace reports"
      intro="Inspect delivered marketplace value and financial outcomes."
    >
      <MarketplaceMetricsDesk />
    </AuthShell>
  );
}
