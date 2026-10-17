import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { PrivacyDesk } from "@/components/privacy";
import { useQueryClient } from "@tanstack/react-query";
import { accountSessionKey } from "@/lib/session";
export const Route = createFileRoute("/privacy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your data and privacy | Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});
function Page() {
  const cache = useQueryClient();
  return (
    <AuthShell
      title="Your data and privacy"
      intro="Verified requests, clear outcomes and purpose-limited retention."
      footer={
        <Link to="/account" className="link">
          Back to your account
        </Link>
      }
    >
      <PrivacyDesk
        onDeleted={() => {
          void cache.cancelQueries({ queryKey: accountSessionKey });
          cache.setQueryData(accountSessionKey, {
            ok: false,
            error: {
              kind: "http",
              status: 401,
              code: "UNAUTHENTICATED",
              message: "Please sign in.",
            },
          });
        }}
      />
    </AuthShell>
  );
}
