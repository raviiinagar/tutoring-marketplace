import { createFileRoute } from "@tanstack/react-router";
import { RecommendationPage } from "@/components/tutor-recommendations";
export const Route = createFileRoute("/recommendations_/$profileId")({
  ssr: false,
  component: Page,
  head: () => ({
    meta: [
      { title: "Recommend a Tutor — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function Page() {
  const { profileId } = Route.useParams();
  return <RecommendationPage profileId={profileId} />;
}
