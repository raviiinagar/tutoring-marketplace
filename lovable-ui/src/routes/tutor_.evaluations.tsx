import { createFileRoute } from "@tanstack/react-router";
import { TutorEvaluationsPage } from "@/components/tutor-recommendations";
export const Route = createFileRoute("/tutor_/evaluations")({
  ssr: false,
  component: TutorEvaluationsPage,
  head: () => ({
    meta: [
      { title: "Your evaluations — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
