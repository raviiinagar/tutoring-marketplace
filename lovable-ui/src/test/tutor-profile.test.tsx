import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeacherPage } from "@/components/public-pages";
import type { PublicTeacherPage } from "@/lib/api";
vi.mock("@/components/account/ui", () => ({
  SiteHeader: () => <header>Tutor Marketplace</header>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/contact-request-form", () => ({
  ContactRequestForm: () => <form aria-label="Existing enquiry form" />,
}));
vi.mock("@/components/reviews", () => ({ PublicReviews: () => <p>Connection-linked reviews</p> }));
afterEach(cleanup);
const page: PublicTeacherPage = {
  seo: {
    path: "/teachers/physics-test",
    canonical: "https://example.invalid/teachers/physics-test",
    title: "Physics",
    description: "Physics",
    indexable: false,
  },
  catalogue: { domains: [], terms: [] },
  listing: {
    id: "test-offer",
    revision: 1,
    tutor: { display_name: "Fictional Asha" },
    available: true,
    evidence_labels: [],
    verification_disclaimer: "Identity review does not verify teaching expertise.",
    offer: {
      title: "Physics through worked examples",
      description: "Patient Physics lessons with guided practice.",
      domain_id: "school",
      subject_id: "subject-physics",
      level_id: "class-10",
      language_ids: ["english"],
      currency: "INR",
      teaching_mode: "ONLINE",
      rate_paise: 75000,
      rate_unit: "LESSON",
      lesson_minutes: 45,
      trial_kind: "NONE",
    },
  },
};
it("keeps lesson pricing and contact eligibility separate without inventing free classes or reputation", () => {
  render(<TeacherPage page={page} />);
  expect(screen.getByText(/lesson \(45 min\)/)).toBeTruthy();
  expect(screen.getByText("No trial offered")).toBeTruthy();
  expect(screen.queryByText(/1st class free|Ambassador|2h|50\+/)).toBeNull();
  expect(screen.getByRole("link", { name: "Contact Fictional Asha" }).getAttribute("href")).toBe(
    "#contact",
  );
  expect(screen.getByText(/In-app enquiries use the Learner Access Pass/)).toBeTruthy();
  expect(screen.getByRole("form", { name: "Existing enquiry form" })).toBeTruthy();
  expect(screen.getByText("Identity review does not verify teaching expertise.")).toBeTruthy();
});
it("shows only actual reviewed ratings and the Tutor's recorded trial terms", () => {
  render(
    <TeacherPage
      page={{
        ...page,
        listing: {
          ...page.listing,
          review_summary: { count: 3, average: 4.7, label: "Connection-linked reviews" },
          offer: { ...page.listing.offer, trial_kind: "FREE", trial_minutes: 20 },
        },
      }}
    />,
  );
  expect(screen.getByRole("link", { name: "4.7 (3 reviews)" })).toBeTruthy();
  expect(screen.getByText("Free trial · 20 minutes")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Tutor reviews" })).toBeTruthy();
});
