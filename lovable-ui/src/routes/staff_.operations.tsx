import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/account/ui";
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
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <Link to="/staff" className="link">
          Back to staff console
        </Link>
        <h1 className="my-6 text-3xl font-semibold sm:text-4xl">Operations and safe recovery</h1>
        <OperationsDesk />
      </main>
    </div>
  );
}
