import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/components/account-settings";
export const Route = createFileRoute("/account_/settings")({
  ssr: false,
  component: AccountSettings,
  head: () => ({
    meta: [
      { title: "Account settings — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
