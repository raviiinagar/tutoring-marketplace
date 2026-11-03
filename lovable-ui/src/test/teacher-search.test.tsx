import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TeacherSearchBar } from "@/components/teacher-search-bar";
import { api, type Catalogue } from "@/lib/api";
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
      aliases: ["Maths", "Math"],
      domain_ids: ["school"],
      active: true,
    },
    {
      id: "subject-physics",
      kind: "SUBJECT",
      label: "Physics",
      aliases: [],
      domain_ids: ["school"],
      active: true,
    },
  ],
  combinations: [],
} as Catalogue;
it("subject aliases and a city produce independent, typed search filters", async () => {
  vi.spyOn(api, "tutorLocations").mockResolvedValue({
    ok: true,
    status: 200,
    data: { locations: [] },
  });
  const search = vi.fn();
  render(<TeacherSearchBar catalogue={catalogue} onSearch={search} />);
  const subject = await screen.findByRole("combobox", { name: "Subject or exam" });
  fireEvent.change(subject, { target: { value: "Maths" } });
  fireEvent.click(screen.getByRole("option", { name: "Mathematics" }));
  const location = screen.getByRole("combobox", { name: "Class location" });
  fireEvent.change(location, { target: { value: "Mumbai" } });
  fireEvent.click(screen.getByRole("option", { name: "Mumbai, India" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(search).toHaveBeenCalledWith({
    subject_id: "subject-mathematics",
    teaching_mode: "IN_PERSON",
    location: "Mumbai",
    country: "India",
  });
});
it("Online search clears locality and works with keyboard selection", async () => {
  vi.spyOn(api, "tutorLocations").mockResolvedValue({
    ok: true,
    status: 200,
    data: { locations: [] },
  });
  const search = vi.fn();
  render(<TeacherSearchBar catalogue={catalogue} onSearch={search} />);
  const location = await screen.findByRole("combobox", { name: "Class location" });
  fireEvent.focus(location);
  fireEvent.keyDown(location, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(search).toHaveBeenCalledWith({ teaching_mode: "ONLINE" });
  expect(screen.queryByRole("listbox")).toBeNull();
});
it("unknown subjects do not silently search unrelated teachers and Escape closes suggestions", async () => {
  const search = vi.fn();
  render(<TeacherSearchBar catalogue={catalogue} onSearch={search} />);
  const input = await screen.findByRole("combobox", { name: "Subject or exam" });
  fireEvent.change(input, { target: { value: "Nonexistent subject" } });
  fireEvent.submit(screen.getByRole("form", { name: "Find a teacher" }));
  await screen.findByRole("alert");
  expect(search).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
});

it("clearing the location then choosing Anywhere removes hidden country and mode", async () => {
  vi.spyOn(api, "tutorLocations").mockResolvedValue({
    ok: true,
    status: 200,
    data: { locations: [] },
  });
  const search = vi.fn();
  render(
    <TeacherSearchBar
      catalogue={catalogue}
      initial={{
        subject_id: "subject-physics",
        location: "Mumbai",
        country: "India",
        teaching_mode: "IN_PERSON",
      }}
      onSearch={search}
    />,
  );
  const clear = await screen.findByRole("button", { name: "Clear location" });
  fireEvent.click(clear);
  expect(screen.getByRole("combobox", { name: "Class location" })).toHaveFocus();
  fireEvent.click(screen.getByRole("option", { name: "Anywhere" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(search).toHaveBeenCalledWith({ subject_id: "subject-physics" });
});
it("a chosen exam ID is preserved even when a Subject has the same label", async () => {
  const search = vi.fn();
  render(
    <TeacherSearchBar
      catalogue={{
        ...catalogue,
        terms: [
          ...catalogue.terms,
          {
            id: "subject-shared",
            kind: "SUBJECT",
            label: "Shared",
            aliases: [],
            domain_ids: ["school"],
            active: true,
          },
          {
            id: "exam-shared",
            kind: "EXAM",
            label: "Shared",
            aliases: [],
            domain_ids: ["school"],
            active: true,
          },
        ],
      }}
      onSearch={search}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Subject or exam" }), {
    target: { value: "Shared" },
  });
  fireEvent.click(screen.getByRole("option", { name: "Shared (exam)" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(search).toHaveBeenCalledWith({ exam_id: "exam-shared" });
});
it("location failure is visible and retry keeps manually entered locations searchable", async () => {
  vi.spyOn(api, "tutorLocations")
    .mockResolvedValueOnce({ ok: false, error: { kind: "unavailable" } })
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        locations: [{ label: "Rohini, Delhi", query: "Rohini", city: "Delhi", country: "India" }],
      },
    });
  const search = vi.fn();
  render(<TeacherSearchBar catalogue={catalogue} onSearch={search} />);
  const input = screen.getByRole("combobox", { name: "Class location" });
  fireEvent.change(input, { target: { value: "Rohini" } });
  expect(screen.getByRole("status")).toHaveTextContent("Loading location");
  fireEvent.click(await screen.findByRole("button", { name: "Retry locations" }));
  fireEvent.click(await screen.findByRole("option", { name: "Rohini, Delhi" }));
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  expect(search).toHaveBeenCalledWith({
    location: "Rohini",
    country: "India",
    teaching_mode: "IN_PERSON",
  });
});
it("a late location response cannot put the previous city into a new query", async () => {
  let oldReply: (value: Awaited<ReturnType<typeof api.tutorLocations>>) => void = () => {};
  vi.spyOn(api, "tutorLocations")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldReply = resolve;
        }),
    )
    .mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        locations: [{ label: "New area, Kota", query: "New area", city: "Kota", country: "India" }],
      },
    });
  render(<TeacherSearchBar catalogue={catalogue} onSearch={vi.fn()} />);
  const input = screen.getByRole("combobox", { name: "Class location" });
  fireEvent.change(input, { target: { value: "Old area" } });
  await waitFor(() => expect(api.tutorLocations).toHaveBeenCalledWith("Old area"));
  fireEvent.change(input, { target: { value: "New area" } });
  await screen.findByRole("option", { name: "New area, Kota" });
  oldReply({
    ok: true,
    status: 200,
    data: {
      locations: [
        { label: "Old area, Jaipur", query: "Old area", city: "Jaipur", country: "India" },
      ],
    },
  });
  await waitFor(() =>
    expect(screen.queryByRole("option", { name: "Old area, Jaipur" })).toBeNull(),
  );
  expect(screen.getByRole("option", { name: "New area, Kota" })).toBeVisible();
});
