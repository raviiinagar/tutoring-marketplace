import { createFileRoute } from "@tanstack/react-router";
import { StaffRecommendationsPage } from "@/components/staff-recommendations";
export const Route = createFileRoute("/staff_/recommendations")({
  ssr: false,
  component: StaffRecommendationsPage,
  head: () => ({
    meta: [
      { title: "Recommendation moderation — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
