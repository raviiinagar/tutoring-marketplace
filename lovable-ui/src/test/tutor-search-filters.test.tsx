import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Catalogue } from "@/lib/api";
import { TutorSearchFilters } from "@/components/tutor-search-filters";
afterEach(() => cleanup());
const catalogue = {
  domains: [{ id: "school", label: "School" }],
  terms: [
    {
      id: "class10",
      kind: "LEVEL",
      label: "Class 10",
      aliases: [],
      domain_ids: ["school"],
      active: true,
    },
  ],
  combinations: [],
} as Catalogue;
it("stages mode changes, cancels without changing results, then applies", () => {
  const apply = vi.fn();
  render(
    <TutorSearchFilters
      filters={{ subject_id: "physics" }}
      catalogue={catalogue}
      onApply={apply}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Type of class" }));
  fireEvent.click(screen.getByLabelText("Online", { exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Type of class" }));
  expect(screen.getByLabelText("Online + in person")).toBeChecked();
  fireEvent.click(screen.getByLabelText("In person", { exact: true }));
  fireEvent.change(screen.getByLabelText("City or area"), { target: { value: "Kota" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).toHaveBeenCalledWith({
    subject_id: "physics",
    teaching_mode: "IN_PERSON",
    location: "Kota",
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("budget defaults explicitly to hourly, preserves an imported higher limit and validates ranges", () => {
  const apply = vi.fn();
  render(
    <TutorSearchFilters filters={{ max_rate_paise: 900000, rate_unit: "HOUR" }} onApply={apply} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Budget" }));
  expect(screen.getByLabelText("Max price (INR)")).toHaveValue(9000);
  expect(screen.getByRole("slider")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Min price (INR)"), { target: { value: "10000" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Minimum price");
  expect(apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Min price (INR)"), { target: { value: "100" } });
  fireEvent.click(screen.getByLabelText("Free introductory class offered"));
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).toHaveBeenCalledWith({
    rate_unit: "HOUR",
    min_rate_paise: 10000,
    max_rate_paise: 900000,
    trial_kind: "FREE",
  });
});
it("sort and chips produce complete next URL filters with dependent resets", () => {
  const apply = vi.fn();
  const { rerender } = render(
    <TutorSearchFilters filters={{ subject_id: "physics" }} onApply={apply} />,
  );
  fireEvent.change(screen.getByLabelText("Sort teaching offers"), {
    target: { value: "PRICE_ASC" },
  });
  expect(apply).toHaveBeenLastCalledWith({
    subject_id: "physics",
    rate_unit: "HOUR",
    sort: "PRICE_ASC",
  });
  rerender(
    <TutorSearchFilters
      filters={{
        subject_id: "physics",
        rate_unit: "HOUR",
        sort: "PRICE_ASC",
        max_rate_paise: 50000,
        cursor: "old",
      }}
      onApply={apply}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove Per hour" }));
  expect(apply).toHaveBeenLastCalledWith({ subject_id: "physics" });
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(apply).toHaveBeenLastCalledWith({});
});
it("controlled URL changes discard an open stale draft and reopening reflects the URL", () => {
  const apply = vi.fn();
  const { rerender } = render(
    <TutorSearchFilters filters={{ teaching_mode: "ONLINE" }} onApply={apply} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Type of class" }));
  fireEvent.click(screen.getByLabelText("In person", { exact: true }));
  rerender(
    <TutorSearchFilters
      filters={{ teaching_mode: "IN_PERSON", location: "Mumbai" }}
      onApply={apply}
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Type of class" }));
  expect(screen.getByLabelText("City or area")).toHaveValue("Mumbai");
  expect(screen.getByLabelText("In person", { exact: true })).toBeChecked();
  expect(apply).not.toHaveBeenCalled();
});
it("level and advanced learning preferences remain available without a long sidebar", () => {
  const apply = vi.fn();
  render(<TutorSearchFilters filters={{}} catalogue={catalogue} onApply={apply} />);
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Learner Level"), {
    target: { value: "class10" },
  });
  fireEvent.click(within(dialog).getByText("More learning preferences"));
  fireEvent.change(within(dialog).getByLabelText("Preferred day"), { target: { value: "MON" } });
  fireEvent.change(within(dialog).getByLabelText("Preferred time (IST)"), {
    target: { value: "17:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).toHaveBeenCalledWith({ level_id: "class10", day: "MON", at_time: 1020 });
});

it("returns focus to the opening filter and announces an unlimited budget honestly", async () => {
  const apply = vi.fn();
  render(<TutorSearchFilters filters={{}} onApply={apply} />);
  const button = screen.getByRole("button", { name: "Budget" });
  button.focus();
  fireEvent.click(button);
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "No maximum applied");
  expect(screen.getByLabelText("Tuition unit")).toHaveValue("HOUR");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(button).toHaveFocus();
  expect(apply).not.toHaveBeenCalled();
});
