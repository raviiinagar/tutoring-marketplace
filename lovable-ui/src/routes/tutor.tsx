import { createFileRoute } from "@tanstack/react-router";
import { TutorOnboarding } from "@/components/tutor-onboarding";
export const Route = createFileRoute("/tutor")({
  ssr: false,
  component: TutorOnboarding,
  head: () => ({
    meta: [
      { title: "Tutor onboarding — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
