import type { Config } from "./config.js";
import { DiscoveryService } from "./discovery.js";
import { CatalogueService } from "./catalogue.js";
import { ApiProblem } from "./errors.js";
import { z } from "zod";
type Offer = Awaited<ReturnType<DiscoveryService["detail"]>>["listing"];
const missing = () =>
  new ApiProblem(
    404,
    "PUBLIC_PAGE_UNAVAILABLE",
    "This public page is currently unavailable.",
  );
const teacherPath = (listing: Offer) => listing.public_path;
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export class PublicPages {
  constructor(
    private readonly config: Config,
    private readonly discovery: DiscoveryService,
    private readonly catalogue: CatalogueService,
  ) {}
  private seo(
    path: string,
    title: string,
    description: string,
    supply: boolean,
    image?: string,
  ) {
    return {
      path,
      canonical: this.config.webOrigin + path,
      title: title + " | Tutor Marketplace",
      description,
      indexable: this.config.mode === "production" && supply,
      ...(image ? { image: this.config.webOrigin + image } : {}),
    };
  }
  async teacher(slug: string) {
    const id = slug.match(
      /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/,
    )?.[1];
    if (!id || !z.uuid().safeParse(id).success) throw missing();
    const { listing } = await this.discovery.detail(id),
      path = teacherPath(listing),
      catalogue = await this.catalogue.publicCatalogue();
    return {
      listing,
      catalogue,
      seo: this.seo(
        path,
        listing.offer.title,
        listing.offer.description.slice(0, 160),
        true,
        listing.tutor.photo_url,
      ),
      ...("/teachers/" + slug !== path ? { redirect_to: path } : {}),
    };
  }
  async category(domain: string, subject: string) {
    const catalogue = await this.catalogue.publicCatalogue(),
      d = catalogue.domains.find((d) => d.id === domain),
      s = catalogue.terms.find(
        (s) =>
          s.kind === "SUBJECT" &&
          s.id === subject &&
          s.domain_ids.includes(domain),
      );
    if (!d || !s) throw missing();
    const offers = (await this.discovery.publicIndex()).filter(
      (o) => o.offer.domain_id === domain && o.offer.subject_id === subject,
    );
    return {
      domain: d,
      subject: s,
      offers,
      catalogue,
      seo: this.seo(
        "/learn/" + domain + "/" + subject,
        s.label + " online Tutors for " + d.label,
        "Compare currently available " +
          s.label +
          " teaching offers, tuition units and evidence-review labels. Tuition is paid directly to Tutors.",
        offers.length > 0,
      ),
    };
  }
  async index() {
    const [offers, catalogue] = await Promise.all([
      this.discovery.publicIndex(),
      this.catalogue.publicCatalogue(),
    ]);
    const counts = new Map<string, number>();
    for (const o of offers) {
      const key = o.offer.domain_id + "/" + o.offer.subject_id;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const categories = [...counts]
      .map(([key, count]) => {
        const [domain, subject] = key.split("/");
        return {
          path: "/learn/" + key,
          domain_id: domain,
          subject_id: subject,
          label:
            catalogue.terms.find((t) => t.id === subject)?.label || subject,
          domain:
            catalogue.domains.find((d) => d.id === domain)?.label || domain,
          offers: count,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
    return {
      offers: offers.slice(0, 6),
      catalogue,
      categories,
      seo: this.seo(
        "/",
        "Find your next teacher",
        "Find approved online teaching offers across India. Compare subjects, tuition terms and current availability.",
        offers.length > 0,
      ),
    };
  }
  async sitemap() {
    const offers = await this.discovery.publicIndex();
    const paths =
      this.config.mode === "production" && offers.length
        ? [
            "/",
            ...offers.map(
              (o) => "/learn/" + o.offer.domain_id + "/" + o.offer.subject_id,
            ),
            ...offers.map(teacherPath),
          ]
        : [];
    return (
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...new Set(paths)]
        .sort()
        .map(
          (path) =>
            "<url><loc>" +
            escapeXml(this.config.webOrigin + path) +
            "</loc></url>",
        )
        .join("") +
      "</urlset>"
    );
  }
  robots() {
    return this.config.mode === "production"
      ? "User-agent: *\nAllow: /\nAllow: /v1/discovery/*/photos/\nDisallow: /account\nDisallow: /auth/\nDisallow: /staff\nDisallow: /tutor\nDisallow: /tutors\nDisallow: /learners\nDisallow: /requests\nDisallow: /connections\nDisallow: /payments\nDisallow: /privacy\nDisallow: /reviews\nDisallow: /notifications\nDisallow: /safety\nDisallow: /support\nDisallow: /dev/\nDisallow: /v1/\nSitemap: " +
          this.config.webOrigin +
          "/sitemap.xml\n"
      : "User-agent: *\nDisallow: /\n";
  }
}
