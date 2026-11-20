import { createFileRoute } from "@tanstack/react-router";
import { TutorListingsPage } from "@/components/tutor-listings-page";

export const Route = createFileRoute("/tutor_/listings")({
  ssr: false,
  component: TutorListingsPage,
  head: () => ({
    meta: [{ title: "My ads — Tutor Marketplace" }, { name: "robots", content: "noindex" }],
  }),
});
