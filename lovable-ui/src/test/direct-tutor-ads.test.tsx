import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Catalogue, TeachingListing, TutorPhoto } from "@/lib/api";
import { TutorAdManager } from "@/components/tutor-ad-manager";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
const ad: TeachingListing = {
  id: "ad-physics",
  user_id: "tutor",
  revision: 3,
  profile_revision: 2,
  status: "DRAFT",
  eligible: false,
  requires_profile_review: false,
  review_reason: null,
  safety_reason: null,
  offer: {
    title: "Physics through practical examples",
    description: "Build confidence through guided practice.",
    domain_id: "school",
    subject_id: "physics",
    level_id: "class10",
    language_ids: ["english"],
    currency: "INR",
    teaching_mode: "ONLINE",
    rate_paise: 50000,
    rate_unit: "HOUR",
    trial_kind: "NONE",
  },
};
const catalogue: Catalogue = {
  domains: [],
  terms: [
    { id: "physics", kind: "SUBJECT", label: "Physics", active: true, aliases: [], domain_ids: [] },
    { id: "class10", kind: "LEVEL", label: "Class 10", active: true, aliases: [], domain_ids: [] },
    {
      id: "english",
      kind: "LANGUAGE",
      label: "English",
      active: true,
      aliases: [],
      domain_ids: [],
    },
  ],
};
const portrait: TutorPhoto = {
  id: "portrait",
  status: "PENDING",
  self_published: true,
  scan_status: "CLEAN",
  test_only: true,
  review_reason: null,
};
function mount(item = ad, disabled = false, photo: TutorPhoto | null = portrait) {
  const onAction = vi.fn(),
    onEdit = vi.fn(),
    onCreate = vi.fn();
  render(
    <TutorAdManager
      ads={[item]}
      photo={photo}
      catalogue={catalogue}
      subjects={["physics"]}
      disabled={disabled}
      canCreate
      onCreate={onCreate}
      onEdit={onEdit}
      onAction={onAction}
    />,
  );
  return { onAction, onEdit, onCreate };
}
afterEach(cleanup);

it("shows the ad's teaching sections and publishes a draft for free without Pro or identity approval", () => {
  const { onAction } = mount();
  for (const name of [
    "Courses taught",
    "Ad title",
    "Venue",
    "Levels",
    "Languages",
    "About you",
    "About the class",
    "Price",
    "First class",
    "Recommendations",
  ])
    expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.getByText(ad.offer.title)).toBeVisible();
  expect(screen.getByText("Publishing is free. Identity verification is optional.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish my ad" }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith(ad, "PUBLISH");
});

it.each([
  ["staff restriction", { publication_restricted: true }],
  ["changed profile", { requires_profile_review: true }],
])("prevents publication when there is a %s", (_reason, changes) => {
  const { onAction } = mount({ ...ad, ...changes });
  expect(screen.getByRole("button", { name: "Publish my ad" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Publish my ad" }));
  expect(onAction).not.toHaveBeenCalled();
});

it("keeps a staff-suspended ad unavailable and offers no publish or resume control", () => {
  mount({
    ...ad,
    status: "SAFETY_SUSPENDED",
    safety_reason: "Account restriction remains in force.",
  });
  expect(screen.getByRole("status")).toHaveTextContent("Your ad is unavailable");
  expect(screen.getByRole("alert")).toHaveTextContent("Account restriction remains in force.");
  expect(screen.queryByRole("button", { name: "Publish my ad" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});

it("keeps an online ad online when deactivation is cancelled, then requires explicit confirmation", () => {
  const online = { ...ad, status: "PUBLISHED" as const, eligible: true };
  const { onAction } = mount(online);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Deactivate your ad?");
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "Deactivate this ad" }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith(online, "PAUSE");
});

it("resumes an eligible offline ad directly", () => {
  const paused = { ...ad, status: "PAUSED" as const };
  const { onAction } = mount(paused);
  expect(screen.getByRole("status")).toHaveTextContent("Your ad is offline");
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  fireEvent.click(screen.getByRole("switch"));
  expect(onAction).toHaveBeenCalledExactlyOnceWith(paused, "RESUME");
});

it("archives only after confirmation and explains that established history is retained", () => {
  const { onAction } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Delete advert" }));
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveTextContent(
    "Existing enquiries, payment history and Connections are retained.",
  );
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete advert" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete advert" }),
  );
  expect(onAction).toHaveBeenCalledExactlyOnceWith(ad, "ARCHIVE");
});

it.each([
  ["courses taught", 0],
  ["ad title", 1],
  ["venue", 0],
  ["levels", 0],
  ["languages", 0],
  ["about the class", 1],
  ["price", 2],
  ["first class", 2],
])("opens the correct editor step for %s", (section, step) => {
  const { onEdit } = mount();
  fireEvent.click(screen.getByRole("button", { name: `Modify ${section}` }));
  expect(onEdit).toHaveBeenCalledExactlyOnceWith(ad, step);
});

it("does not describe an unavailable published ad as online or offer its student view", () => {
  mount({ ...ad, status: "PUBLISHED", eligible: false });
  expect(screen.getByRole("status")).toHaveTextContent("Your ad is unavailable");
  expect(
    within(screen.getByRole("complementary", { name: "Your ads" })).queryByText("Online"),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Student's view" })).not.toBeInTheDocument();
});

it("disables mutation controls while another operation is pending", () => {
  const { onAction, onEdit, onCreate } = mount(ad, true);
  fireEvent.click(screen.getByRole("button", { name: "Publish my ad" }));
  fireEvent.click(screen.getByRole("button", { name: "Modify price" }));
  fireEvent.click(screen.getByRole("button", { name: "Create an ad" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete advert" }));
  expect(onAction).not.toHaveBeenCalled();
  expect(onEdit).not.toHaveBeenCalled();
  expect(onCreate).not.toHaveBeenCalled();
});

it.each([{ publication_restricted: true }, { requires_profile_review: true }])(
  "does not resume an offline ad with an outstanding restriction (%j)",
  (restriction) => {
    const { onAction } = mount({ ...ad, status: "PAUSED", ...restriction });
    expect(screen.getByRole("switch")).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    expect(onAction).not.toHaveBeenCalled();
  },
);

it.each([
  ["no photo", null],
  ["a pending photo without public consent", { ...portrait, self_published: false }],
  [
    "a pending photo without a self-publication flag",
    { id: "photo", status: "PENDING", scan_status: "CLEAN", test_only: true, review_reason: null },
  ],
  ["an unscanned approved photo", { ...portrait, status: "APPROVED", scan_status: "ERROR" }],
  ["a rejected photo", { ...portrait, status: "REJECTED" }],
] as const)(
  "requires a usable portrait before publishing or resuming with %s",
  (_reason, photo) => {
    const publish = mount(ad, false, photo);
    expect(screen.getByRole("button", { name: "Publish my ad" })).toBeDisabled();
    expect(screen.getByText(/Add a profile photo before/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Modify courses taught" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Publish my ad" }));
    expect(publish.onAction).not.toHaveBeenCalled();
    cleanup();
    const resume = mount({ ...ad, status: "PAUSED" }, false, photo);
    expect(screen.getByRole("switch")).toBeDisabled();
    fireEvent.click(screen.getByRole("switch"));
    expect(resume.onAction).not.toHaveBeenCalled();
  },
);

it("keeps an existing online ad manageable without requiring a new portrait", () => {
  const online = { ...ad, status: "PUBLISHED" as const, eligible: true };
  const { onAction } = mount(online, false, null);
  expect(screen.getByRole("switch")).toBeEnabled();
  expect(screen.getByRole("button", { name: "Modify courses taught" })).toBeEnabled();
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "Deactivate this ad" }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith(online, "PAUSE");
});
