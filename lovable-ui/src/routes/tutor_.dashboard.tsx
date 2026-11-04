import { createFileRoute } from "@tanstack/react-router";
import { TutorDashboard } from "@/components/tutor-dashboard";
export const Route = createFileRoute("/tutor_/dashboard")({
  ssr: false,
  component: TutorDashboard,
  head: () => ({
    meta: [
      { title: "Tutor dashboard — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
