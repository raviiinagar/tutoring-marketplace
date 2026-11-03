import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { CatalogueBrowser } from "@/components/catalogue-browser";
import { api, type Catalogue, type CatalogueKind } from "@/lib/api";
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
const term = (
  id: string,
  kind: CatalogueKind,
  label: string,
  domain_ids: string[],
  aliases: string[] = [],
  active = true,
) => ({ id, kind, label, domain_ids, aliases, active });
const catalogue: Catalogue = {
  domains: [
    { id: "school", label: "School education" },
    { id: "entrance", label: "Entrance examinations" },
    { id: "career", label: "Career skills" },
  ],
  terms: [
    term("subject-mathematics", "SUBJECT", "Mathematics", ["school", "entrance"], ["Maths"]),
    term("exam-jee", "EXAM", "JEE", ["entrance"], ["IIT-JEE"]),
    term("level-12", "LEVEL", "Class 12", ["school"]),
    term("curriculum-cbse", "CURRICULUM", "CBSE", ["school"]),
    term("language-english", "LANGUAGE", "English", ["school", "entrance"]),
    term("subject-programming", "SUBJECT", "Programming", ["career"], ["Coding"]),
    term("subject-hidden", "SUBJECT", "Hidden", ["school"], ["Secret alias"], false),
  ],
};
it("uses the SSR catalogue and routes shared Subjects and Exam Tracks with the correct domain and typed filter", () => {
  const fetch = vi.spyOn(api, "catalogue");
  render(<CatalogueBrowser initialCatalogue={catalogue} />);
  const school = screen.getByRole("article", { name: "School education" });
  expect(within(school).getByRole("link", { name: "Mathematics" })).toHaveAttribute(
    "href",
    "/tutors?domain_id=school&subject_id=subject-mathematics",
  );
  const entrance = screen.getByRole("article", { name: "Entrance examinations" });
  expect(within(entrance).getByRole("link", { name: "JEE" })).toHaveAttribute(
    "href",
    "/tutors?domain_id=entrance&exam_id=exam-jee",
  );
  expect(within(entrance).getByRole("link", { name: "View Tutors" })).toHaveAttribute(
    "href",
    "/tutors?domain_id=entrance",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByText("Hidden")).toBeNull();
});
it("matches aliases immediately and separates a selected domain from search with a complete reset", () => {
  render(<CatalogueBrowser initialCatalogue={catalogue} />);
  const search = screen.getByRole("searchbox", { name: "Search subjects or exams" });
  fireEvent.change(search, { target: { value: "  IIT - JEE  " } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "JEE" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Career skills" }));
  expect(screen.getByRole("heading", { name: "No matching subjects" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Reset subject filters" }));
  expect(search).toHaveValue("");
  expect(screen.getAllByRole("article")).toHaveLength(3);
  fireEvent.change(search, { target: { value: "Secret alias" } });
  expect(screen.queryByRole("article")).toBeNull();
});
it("full learning options preserve distinct curriculum, level and Teaching Language filters and restore focus on Escape", () => {
  render(<CatalogueBrowser initialCatalogue={catalogue} />);
  const trigger = screen.getByRole("button", { name: "All school education options" });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "School education" });
  expect(within(dialog).getByRole("link", { name: "Class 12" })).toHaveAttribute(
    "href",
    "/tutors?domain_id=school&level_id=level-12",
  );
  expect(within(dialog).getByRole("link", { name: "CBSE" })).toHaveAttribute(
    "href",
    "/tutors?domain_id=school&curriculum_id=curriculum-cbse",
  );
  expect(within(dialog).getByRole("link", { name: "English" })).toHaveAttribute(
    "href",
    "/tutors?domain_id=school&language_id=language-english",
  );
  expect(within(dialog).queryByText("Hidden")).toBeNull();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("searches category labels and can show all available options without a popularity or Tutor supply claim", () => {
  render(<CatalogueBrowser initialCatalogue={catalogue} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Career" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Programming" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.click(screen.getByRole("button", { name: "School education" }));
  expect(screen.getByRole("button", { name: "School education" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "All subjects" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByText(/These are catalogue options/)).toBeVisible();
});
it("handles a failed standalone catalogue load with retry and an honest empty state", async () => {
  vi.spyOn(api, "catalogue")
    .mockResolvedValueOnce({
      ok: false,
      error: { kind: "http", status: 503, code: "UNAVAILABLE", message: "Temporarily unavailable" },
    })
    .mockResolvedValueOnce({ ok: true, status: 200, data: { domains: [], terms: [] } });
  render(<CatalogueBrowser />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading subjects");
  fireEvent.click(await screen.findByRole("button", { name: "Retry catalogue" }));
  expect(await screen.findByRole("heading", { name: "No matching subjects" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});
