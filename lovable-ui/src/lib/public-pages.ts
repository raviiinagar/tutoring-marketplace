import { notFound } from "@tanstack/react-router";
import type { ApiResult, PublicSeo } from "./api";
export function requirePublic<T>(result: ApiResult<T>): T {
  if (result.ok) return result.data;
  if (result.error.kind === "http" && [400, 404].includes(result.error.status)) throw notFound();
  throw new Error("Public supply is temporarily unavailable. Please try again.");
}
export function publicHead(seo?: PublicSeo) {
  return {
    meta: [
      { title: seo?.title || "Page unavailable | Tutor Marketplace" },
      {
        name: "description",
        content: seo?.description || "Find currently available online Tutors.",
      },
      { name: "robots", content: seo?.indexable ? "index,follow" : "noindex,follow" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: seo?.title || "Tutor Marketplace" },
      { property: "og:description", content: seo?.description || "" },
      ...(seo ? [{ property: "og:url", content: seo.canonical }] : []),
      ...(seo?.image ? [{ property: "og:image", content: seo.image }] : []),
    ],
    links: seo ? [{ rel: "canonical", href: seo.canonical }] : [],
  };
}
