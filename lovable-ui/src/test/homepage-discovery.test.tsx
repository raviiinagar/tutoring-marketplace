import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PopularSubjects, TutorLocations, HowItWorks } from "@/components/homepage-discovery";
import { api, type Catalogue } from "@/lib/api";
const visibility = vi.hoisted(() => ({
  teachingOffers: true,
  howItWorks: true,
  subjectExplorer: true,
}));
vi.mock("@/lib/site-visibility", () => ({ homepageSections: visibility }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
  }) => (
    <a href={to + (search ? "?" + new URLSearchParams(search) : "")} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const catalogue: Catalogue = {
  domains: [],
  terms: [
    {
      id: "subject-mathematics",
      kind: "SUBJECT",
      label: "Mathematics",
      aliases: ["Maths"],
      domain_ids: [],
      active: true,
    },
    {
      id: "subject-hindi",
      kind: "SUBJECT",
      label: "Hindi",
      aliases: [],
      domain_ids: [],
      active: false,
    },
    {
      id: "subject-pottery",
      kind: "SUBJECT",
      label: "Pottery",
      aliases: [],
      domain_ids: [],
      active: true,
    },
  ],
};
it("popular shortcuts use only active catalogue subjects and retain a route to all subjects", () => {
  render(<PopularSubjects catalogue={catalogue} />);
  expect(screen.getByRole("link", { name: "Maths" })).toHaveAttribute(
    "href",
    "/tutors?subject_id=subject-mathematics",
  );
  expect(screen.getByRole("link", { name: "Pottery" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Hindi" })).toBeNull();
  expect(screen.getByRole("link", { name: "All subjects" })).toHaveAttribute("href", "#subjects");
});
it("while the subject explorer is hidden, the shortcuts do not link to it", () => {
  visibility.subjectExplorer = false;
  try {
    render(<PopularSubjects catalogue={catalogue} />);
    expect(screen.getByRole("link", { name: "Maths" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "All subjects" })).toBeNull();
  } finally {
    visibility.subjectExplorer = true;
  }
});
it("locations deduplicate cities and generate supported city and online filters", async () => {
  vi.spyOn(api, "tutorLocations").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      locations: [
        {
          city: "Kota",
          country: "India",
          area: "Mahaveer Nagar",
          label: "Mahaveer Nagar, Kota",
          query: "Mahaveer Nagar",
        },
        { city: "Kota", country: "India", label: "Kota", query: "Kota" },
      ],
    },
  });
  render(<TutorLocations />);
  const kota = await screen.findByRole("link", { name: /Kota/ });
  expect(screen.getAllByRole("link", { name: /Kota/ })).toHaveLength(1);
  expect(kota).toHaveAttribute(
    "href",
    "/tutors?location=Kota&country=India&teaching_mode=IN_PERSON",
  );
  expect(screen.getByRole("link", { name: /Online/ })).toHaveAttribute(
    "href",
    "/tutors?teaching_mode=ONLINE",
  );
  expect(screen.queryByText("Mumbai")).toBeNull();
});
it("location failures are retryable and empty supply keeps Online without invented cities", async () => {
  vi.spyOn(api, "tutorLocations")
    .mockResolvedValueOnce({
      ok: false,
      error: { kind: "http", status: 503, code: "UNAVAILABLE", message: "Temporarily unavailable" },
    })
    .mockResolvedValueOnce({ ok: true, status: 200, data: { locations: [] } });
  render(<TutorLocations />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry locations" }));
  await waitFor(() =>
    expect(screen.getByText("More locations will appear as Tutors share them.")).toBeVisible(),
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
});
it("explains browsing and platform access separately from Tutor tuition", () => {
  render(<HowItWorks />);
  expect(screen.getByText(/Browsing is free/)).toHaveTextContent("tuition is paid separately");
  expect(screen.getByRole("link", { name: "Find your teacher" })).toHaveAttribute(
    "href",
    "/tutors",
  );
  expect(screen.getByRole("heading", { name: "Make a connection" })).toBeVisible();
});
