import { createFileRoute } from "@tanstack/react-router";
import { LearnerDashboard } from "@/components/learner-dashboard";
export const Route = createFileRoute("/account")({
  ssr: false,
  component: LearnerDashboard,
  head: () => ({
    meta: [
      { title: "Your dashboard — Tutor Marketplace" },
      { name: "description", content: "Your private learning dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
});
