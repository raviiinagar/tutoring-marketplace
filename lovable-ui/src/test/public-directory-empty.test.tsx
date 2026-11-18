import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { api } from "@/lib/api";
import { PublicTutorDirectory } from "@/components/public-tutor-profiles";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const empty = { profiles: [], next_cursor: null };
const catalogue = { domains: [], terms: [] };

it("says plainly that no Tutors are listed yet when nothing is filtered", async () => {
  vi.spyOn(api, "publicTutors").mockResolvedValue({ ok: true, status: 200, data: empty });
  render(<PublicTutorDirectory initialCatalogue={catalogue} />);
  expect(
    await screen.findByText("No Tutors are listed yet. Please check back soon."),
  ).toBeVisible();
  // No advice to change filters or look at a section that may be hidden.
  expect(screen.queryByText(/filters|below/)).toBeNull();
});

it("suggests changing the search only when filters are applied", async () => {
  vi.spyOn(api, "publicTutors").mockResolvedValue({ ok: true, status: 200, data: empty });
  render(
    <PublicTutorDirectory
      initialCatalogue={catalogue}
      filters={{ subject_id: "subject-physics" }}
    />,
  );
  expect(
    await screen.findByText(
      "No Tutor profiles match these filters yet. Try another subject, city or time.",
    ),
  ).toBeVisible();
});
