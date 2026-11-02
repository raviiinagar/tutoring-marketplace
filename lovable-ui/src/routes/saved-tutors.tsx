import { createFileRoute } from "@tanstack/react-router";
import { SavedTutorsPage } from "@/components/saved-tutors";

export const Route = createFileRoute("/saved-tutors")({
  ssr: false,
  component: SavedTutorsPage,
  head: () => ({
    meta: [{ title: "Saved Tutors — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
