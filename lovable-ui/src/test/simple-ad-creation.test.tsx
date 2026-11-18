import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type Catalogue, type TeachingListing, type TutorProfile } from "@/lib/api";
import { Route as ListingsRoute } from "@/routes/tutor_.listings";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/account/ui", async () => ({
  ...(await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui")),
  AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
const success = <T,>(data: T) => ({ ok: true as const, status: 200, data });
const catalogue: Catalogue = {
  domains: [{ id: "school", label: "School education" }],
  terms: [
    {
      id: "subject-physics",
      kind: "SUBJECT",
      label: "Physics",
      active: true,
      aliases: [],
      domain_ids: ["school"],
    },
    {
      id: "level-class-10",
      kind: "LEVEL",
      label: "Class 10",
      active: true,
      aliases: [],
      domain_ids: ["school"],
    },
    {
      id: "curriculum-cbse",
      kind: "CURRICULUM",
      label: "CBSE",
      active: true,
      aliases: [],
      domain_ids: ["school"],
    },
    {
      id: "language-english",
      kind: "LANGUAGE",
      label: "English",
      active: true,
      aliases: [],
      domain_ids: ["school"],
    },
  ],
};
const profile: TutorProfile = {
  display_name: "Fictional Tutor",
  biography: "Patient Physics lessons.",
  revision: 2,
  public_revision: 1,
  birth_date: null,
  status: "DRAFT",
  eligible: false,
  publication_status: "PUBLISHED",
  subject_ids: ["subject-physics"],
  hourly_rate_paise: 50000,
  public_email_consent: false,
  identity_country: "IN",
  identity_document: "AADHAAR",
};
const existing: TeachingListing = {
  id: "existing-ad",
  user_id: "tutor",
  revision: 2,
  profile_revision: 2,
  status: "PUBLISHED",
  eligible: true,
  requires_profile_review: false,
  review_reason: null,
  safety_reason: null,
  offer: {
    title: "Patient Physics lessons with clear worked examples for students studying at school",
    description: "Existing class description.",
    domain_id: "school",
    subject_id: "subject-physics",
    level_id: "level-class-10",
    curriculum_id: "curriculum-cbse",
    language_ids: ["language-english"],
    teaching_mode: "ONLINE",
    currency: "INR",
    rate_paise: 50000,
    rate_unit: "HOUR",
    trial_kind: "NONE",
  },
};
let ads: TeachingListing[];
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Page = ListingsRoute.options.component!;
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  ads = [];
  vi.spyOn(api, "me").mockResolvedValue(
    success({
      user: {
        id: "tutor",
        display_name: "Fictional Tutor",
        email: "fictional@example.test",
        email_verified: true,
        roles: ["TUTOR"],
        created_at: "2026-11-18",
      },
    }),
  );
  vi.spyOn(api, "catalogue").mockResolvedValue(success(catalogue));
  vi.spyOn(api, "tutor").mockResolvedValue(success({ profile, claims: [], evidence: [] }));
  vi.spyOn(api, "listings").mockImplementation(async () =>
    success({
      listings: ads,
      eligible_subject_ids: ["subject-physics"],
      tutor_pro_active: false,
      publication_policy: "direct-ads-v1",
    }),
  );
  vi.spyOn(api, "tutorPhoto").mockResolvedValue(
    success({
      photo: null,
      policy: {
        uploads_enabled: true,
        test_only: true,
        media_types: ["image/png"],
        max_bytes: 1048576,
        notice: "Own portrait only.",
      },
    }),
  );
  vi.spyOn(api, "tutorPresence").mockResolvedValue(
    success({
      presence: {
        revision: 0,
        location: null,
        teaching_modes: ["ONLINE"],
        accepting_students: true,
        weekly_slots: [],
        timezone: "Asia/Kolkata",
        updated_at: null,
      },
    }),
  );
  vi.spyOn(api, "createListing").mockImplementation(async (offer) => {
    const listing = { ...existing, offer, id: "new-ad", status: "DRAFT" as const, eligible: false };
    ads = [listing, ...ads];
    return success({ listing });
  });
  vi.spyOn(api, "listingAction").mockImplementation(async (id) =>
    success({ listing: { ...existing, id } }),
  );
  vi.spyOn(api, "saveTutorIntroduction").mockResolvedValue(
    success({ profile, claims: [], evidence: [] }),
  );
  vi.spyOn(api, "saveTutorPresence");
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

it.each([false, true])(
  "My ads opens one creation form (existing ad: %s), not ten steps",
  async (hasAd) => {
    if (hasAd) ads = [existing];
    mount();
    const create = await screen.findByRole("button", { name: "Create an ad" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    expect(screen.getByRole("textbox", { name: "Ad title" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "About the class" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: "Tuition rate (INR)" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Offer editing progress" })).not.toBeInTheDocument();
    expect(api.createListing).not.toHaveBeenCalled();
    expect(api.listingAction).not.toHaveBeenCalled();
  },
);

async function openForm() {
  mount();
  const create = await screen.findByRole("button", { name: "Create an ad" });
  await waitFor(() => expect(create).toBeEnabled());
  fireEvent.click(create);
}
// jsdom's native click submission omits submitter; browsers include the intent button.
function submit(name: string) {
  const button = screen.getByRole("button", { name });
  const event = new Event("submit", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "submitter", { value: button });
  fireEvent(button.closest("form")!, event);
}

it("reuses saved details without changing the shared profile or requiring an online city", async () => {
  await openForm();
  expect(screen.getByRole("textbox", { name: "About the class" })).toHaveValue(profile.biography);
  expect(screen.getByRole("spinbutton", { name: "Tuition rate (INR)" })).toHaveValue(500);
  expect(screen.queryByRole("textbox", { name: "About you" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Your city")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Create teaching offer" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByRole("heading", { name: "Check your ad before publishing" });
  expect(screen.getByRole("button", { name: "Publish my ad" })).toBeDisabled();
  expect(api.createListing).not.toHaveBeenCalled();
  expect(api.listingAction).not.toHaveBeenCalled();
  expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
  expect(api.saveTutorPresence).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
  expect(screen.getByRole("textbox", { name: "About the class" })).toHaveValue(profile.biography);
});

it("saves a photo-less private draft without publishing or altering existing ads", async () => {
  ads = [existing];
  await openForm();
  fireEvent.change(screen.getByRole("textbox", { name: "About the class" }), {
    target: { value: "A different class description." },
  });
  submit("Save as draft");
  await screen.findByText("Your ad is saved as a private draft.");
  expect(api.createListing).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      description: "A different class description.",
      rate_paise: 50000,
      trial_kind: "FREE",
    }),
  );
  expect(ads).toHaveLength(2);
  expect(ads[1]).toBe(existing);
  expect(api.listingAction).not.toHaveBeenCalled();
  expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
});

it("publishes only after a separate preview and explicit Publish click with a usable photo", async () => {
  vi.mocked(api.tutorPhoto).mockResolvedValue(
    success({
      photo: {
        id: "saved-photo",
        status: "PENDING",
        scan_status: "CLEAN",
        publishable: true,
        test_only: true,
        review_reason: null,
      },
      policy: {
        uploads_enabled: true,
        test_only: true,
        media_types: ["image/png"],
        max_bytes: 1048576,
        notice: "Own portrait only.",
      },
    }),
  );
  await openForm();
  expect(screen.getByText("Your saved profile photo is ready. Change photo")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  const publish = await screen.findByRole("button", { name: "Publish my ad" });
  expect(publish).toBeEnabled();
  expect(api.createListing).not.toHaveBeenCalled();
  expect(api.listingAction).not.toHaveBeenCalled();
  submit("Publish my ad");
  await waitFor(() =>
    expect(api.listingAction).toHaveBeenCalledExactlyOnceWith("new-ad", 2, "PUBLISH"),
  );
  expect(api.createListing).toHaveBeenCalledTimes(1);
});

it.each(["Preview my ad", "Save as draft"])(
  "keeps the 12-word rule when using %s",
  async (action) => {
    await openForm();
    fireEvent.change(screen.getByRole("textbox", { name: "Ad title" }), {
      target: { value: "Four short title words" },
    });
    fireEvent.click(screen.getByRole("button", { name: action }));
    await screen.findByText("Write at least 12 words in your ad title.");
    expect(api.createListing).not.toHaveBeenCalled();
    expect(api.listingAction).not.toHaveBeenCalled();
  },
);

it("requires a city for in-person classes and preserves the existing availability when saving it", async () => {
  const presence = {
    revision: 3,
    location: null,
    teaching_modes: ["ONLINE" as const],
    accepting_students: false,
    weekly_slots: [{ day: "MON" as const, start_minute: 960, end_minute: 1080 }],
    timezone: "Asia/Kolkata" as const,
    updated_at: null,
  };
  vi.mocked(api.tutorPresence).mockResolvedValue(success({ presence }));
  vi.mocked(api.saveTutorPresence).mockImplementation(async (input) =>
    success({
      presence: { ...input, revision: 4, updated_at: "2026-11-18" },
      offers_need_review: 0,
    }),
  );
  await openForm();
  fireEvent.click(screen.getByRole("radio", { name: /In person/ }));
  // Form submission directly exercises validation too, independent of native required fields.
  fireEvent.submit(screen.getByRole("button", { name: "Preview my ad" }).closest("form")!);
  await screen.findByText("Add the city where you teach. Only your city and area appear publicly.");
  expect(api.saveTutorPresence).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your city", { exact: false }), {
    target: { value: "Kota" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByRole("heading", { name: "Check your ad before publishing" });
  expect(api.saveTutorPresence).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      expected_revision: 3,
      location: { city: "Kota", country: "India" },
      teaching_modes: ["ONLINE", "IN_PERSON"],
      accepting_students: false,
      weekly_slots: presence.weekly_slots,
    }),
  );
  expect(api.listingAction).not.toHaveBeenCalled();
});

it("shows a server validation rejection without publishing or losing the form", async () => {
  vi.mocked(api.createListing).mockResolvedValueOnce({
    ok: false,
    error: {
      kind: "http",
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Check the teaching details.",
    },
  });
  await openForm();
  submit("Save as draft");
  await screen.findByText("Check the teaching details.");
  expect(screen.getByRole("textbox", { name: "About the class" })).toHaveValue(profile.biography);
  expect(api.listingAction).not.toHaveBeenCalled();
});

it("keeps the suggested title aligned with the subject without overwriting a custom title", async () => {
  vi.mocked(api.catalogue).mockResolvedValue(
    success({
      ...catalogue,
      terms: [
        ...catalogue.terms,
        {
          id: "subject-chemistry",
          kind: "SUBJECT",
          label: "Chemistry",
          active: true,
          aliases: [],
          domain_ids: ["school"],
        },
      ],
    }),
  );
  vi.mocked(api.listings).mockResolvedValue(
    success({
      listings: [],
      eligible_subject_ids: ["subject-physics", "subject-chemistry"],
      tutor_pro_active: false,
      publication_policy: "direct-ads-v1",
    }),
  );
  await openForm();
  const title = screen.getByRole("textbox", { name: "Ad title" });
  expect(title).toHaveDisplayValue(/^Physics lessons/);
  fireEvent.change(screen.getByRole("combobox", { name: "Subject" }), {
    target: { value: "subject-chemistry" },
  });
  expect(title).toHaveDisplayValue(/^Chemistry lessons/);
  fireEvent.change(title, { target: { value: "A custom title written by the Tutor" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Subject" }), {
    target: { value: "subject-physics" },
  });
  expect(title).toHaveValue("A custom title written by the Tutor");
  expect(api.createListing).not.toHaveBeenCalled();
});
