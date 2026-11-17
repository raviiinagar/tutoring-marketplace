import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  api,
  type Catalogue,
  type TeachingListing,
  type TutorOnboardingDraft,
  type TutorPhoto,
  type TutorProfile,
} from "@/lib/api";
import { SimpleTutorSetup } from "@/components/simple-tutor-setup";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
const catalogue: Catalogue = {
  domains: [{ id: "school", label: "School education" }],
  terms: [
    {
      id: "subject-physics",
      kind: "SUBJECT",
      label: "Physics",
      active: true,
      domain_ids: ["school"],
      aliases: [],
    },
    {
      id: "level-class-10",
      kind: "LEVEL",
      label: "Class 10",
      active: true,
      domain_ids: ["school"],
      aliases: [],
    },
    {
      id: "curriculum-cbse",
      kind: "CURRICULUM",
      label: "CBSE",
      active: true,
      domain_ids: ["school"],
      aliases: [],
    },
    {
      id: "language-english",
      kind: "LANGUAGE",
      label: "English",
      active: true,
      domain_ids: ["school"],
      aliases: [],
    },
  ],
};
const profile: TutorProfile = {
  display_name: "Saved name",
  biography: "Saved teaching",
  revision: 1,
  public_revision: 1,
  birth_date: null,
  status: "DRAFT",
  eligible: false,
  publication_status: "DRAFT",
  subject_ids: ["subject-physics"],
  hourly_rate_paise: 50000,
  public_email_consent: true,
  identity_country: "OTHER",
  identity_document: "PASSPORT",
};
const usable: TutorPhoto = {
  id: "photo-1",
  status: "PENDING",
  scan_status: "CLEAN",
  test_only: true,
  publishable: true,
  self_published: false,
  review_reason: null,
};
let draft: TutorOnboardingDraft | null, ads: TeachingListing[];
function mount(saved?: TutorProfile) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SimpleTutorSetup catalogue={catalogue} profile={saved} />
    </QueryClientProvider>,
  );
}
const success = <T,>(data: T) => ({ ok: true as const, status: 200, data });
beforeEach(() => {
  draft = null;
  ads = [];
  vi.spyOn(api, "me").mockResolvedValue(
    success({
      user: {
        id: "owner",
        display_name: "Account name",
        email: "fictional@example.test",
        roles: ["TUTOR"],
        email_verified: true,
        status: "ACTIVE",
        created_at: "2026-11-17T10:00:00Z",
      },
    }),
  );
  vi.spyOn(api, "tutorOnboardingDraft").mockImplementation(async () => success({ draft }));
  vi.spyOn(api, "saveTutorOnboardingDraft").mockImplementation(async (input) => {
    draft = { ...input, revision: input.revision + 1, updated_at: "2026-11-17T10:00:00Z" };
    return success({ draft });
  });
  vi.spyOn(api, "clearTutorOnboardingDraft").mockResolvedValue({
    ok: true,
    status: 204,
    data: undefined,
  });
  vi.spyOn(api, "uploadTutorPhoto").mockResolvedValue(success({ photo: usable }));
  vi.spyOn(api, "tutorPhoto").mockResolvedValue(
    success({
      photo: usable,
      policy: {
        uploads_enabled: true,
        test_only: true,
        media_types: ["image/png"],
        max_bytes: 1048576,
        notice: "Own portrait only.",
      },
    }),
  );
  const presence = {
    revision: 0,
    location: null,
    teaching_modes: ["ONLINE" as const],
    accepting_students: null,
    weekly_slots: [],
    timezone: "Asia/Kolkata" as const,
    updated_at: null,
  };
  vi.spyOn(api, "tutorPresence").mockResolvedValue(success({ presence }));
  vi.spyOn(api, "saveTutorPresence").mockImplementation(async (input) =>
    success({
      presence: { ...input, revision: 1, updated_at: "2026-11-17T10:00:00Z" },
      offers_need_review: 0,
    }),
  );
  vi.spyOn(api, "saveTutorIntroduction").mockResolvedValue(
    success({ profile, claims: [], evidence: [] }),
  );
  vi.spyOn(api, "listings").mockImplementation(async () =>
    success({ listings: ads, eligible_subject_ids: ["subject-physics"] }),
  );
  vi.spyOn(api, "createListing").mockImplementation(async (offer) => {
    const listing: TeachingListing = {
      id: "ad-1",
      user_id: "owner",
      offer,
      revision: 1,
      profile_revision: 1,
      status: "DRAFT",
      eligible: false,
      requires_profile_review: false,
      review_reason: null,
      safety_reason: null,
    };
    ads.push(listing);
    return success({ listing });
  });
  vi.spyOn(api, "editListing").mockImplementation(async (id, revision, offer) => {
    const listing = { ...ads.find((a) => a.id === id)!, revision: revision + 1, offer };
    ads = [listing];
    return success({ listing });
  });
  vi.spyOn(api, "listingAction").mockImplementation(async (id, revision) =>
    success({
      listing: {
        ...ads.find((a) => a.id === id)!,
        status: "PUBLISHED",
        revision: revision + 1,
        eligible: true,
      },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function fill() {
  await screen.findByRole("heading", { name: "Start teaching" });
  fireEvent.change(screen.getByLabelText("Subject", { exact: true }), {
    target: { value: "subject-physics" },
  });
  fireEvent.change(screen.getByLabelText("Students you teach"), {
    target: { value: "level-class-10" },
  });
  fireEvent.change(screen.getByLabelText("School board"), { target: { value: "curriculum-cbse" } });
  fireEvent.change(screen.getByLabelText("Teaching language"), {
    target: { value: "language-english" },
  });
  fireEvent.change(screen.getByLabelText("Hourly rate (INR)"), { target: { value: "600" } });
  fireEvent.change(screen.getByLabelText("About you and your classes"), {
    target: { value: "Patient Physics classes." },
  });
  const adult = screen.getByLabelText<HTMLInputElement>(
    "I am at least 18 and will provide my own teaching services.",
  );
  if (!adult.checked) fireEvent.click(adult);
}
async function preview() {
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByRole("heading", { name: "Preview your ad" });
}

it("collects the first profile and ad once, with an editable suggested title and explicit publication", async () => {
  mount();
  await fill();
  expect(screen.getByLabelText("Your public name")).toHaveValue("Account name");
  expect(screen.queryByLabelText("Identity document")).not.toBeInTheDocument();
  await preview();
  expect(api.saveTutorIntroduction).toHaveBeenCalledWith(
    expect.objectContaining({
      biography: "Patient Physics classes.",
      hourly_rate_paise: 60000,
      public_email_consent: false,
    }),
  );
  expect(api.createListing).toHaveBeenCalledWith(
    expect.objectContaining({
      description: "Patient Physics classes.",
      rate_paise: 60000,
      trial_kind: "NONE",
    }),
  );
  expect(
    vi.mocked(api.createListing).mock.calls[0]![0].title.trim().split(/\s+/).length,
  ).toBeGreaterThanOrEqual(12);
  expect(api.listingAction).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Publish for free" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Publish for free" }));
  await screen.findByRole("heading", { name: "Your ad is online" });
  expect(api.listingAction).toHaveBeenCalledExactlyOnceWith("ad-1", 1, "PUBLISH");
  expect(screen.getByText(/Your photo will appear after approval/)).toBeVisible();
});
it("autosaves incomplete selections privately and resumes all teaching choices after remount", async () => {
  const view = mount();
  await fill();
  fireEvent.change(screen.getByLabelText("Class mode"), { target: { value: "IN_PERSON" } });
  fireEvent.change(screen.getByLabelText("Your city"), { target: { value: "Kota" } });
  await waitFor(() => expect(draft?.data.quick_setup?.city).toBe("Kota"));
  expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
  expect(api.createListing).not.toHaveBeenCalled();
  view.unmount();
  mount();
  await waitFor(() => expect(screen.getByLabelText("Your city")).toHaveValue("Kota"));
  expect(screen.getByLabelText("Subject", { exact: true })).toHaveValue("subject-physics");
  expect(screen.getByLabelText("School board")).toHaveValue("curriculum-cbse");
  expect(api.listingAction).not.toHaveBeenCalled();
});
it("saves without a photo but blocks publication, and saving a photo never publishes", async () => {
  vi.mocked(api.tutorPhoto).mockResolvedValue(
    success({
      photo: null,
      policy: {
        uploads_enabled: true,
        test_only: true,
        media_types: ["image/png"],
        max_bytes: 1048576,
        notice: "Own portrait.",
      },
    }),
  );
  mount();
  await fill();
  await preview();
  expect(screen.getByRole("button", { name: "Publish for free" })).toBeDisabled();
  expect(ads[0]?.status).toBe("DRAFT");
  expect(api.listingAction).not.toHaveBeenCalled();
});
it("saves a private ad and reuses it after reload instead of creating another", async () => {
  const view = mount();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Your profile and ad are saved privately. Nothing has been published.");
  expect(api.listingAction).not.toHaveBeenCalled();
  view.unmount();
  mount(profile);
  await screen.findByRole("heading", { name: "Start teaching" });
  await preview();
  expect(api.createListing).toHaveBeenCalledTimes(1);
  expect(api.editListing).toHaveBeenCalledTimes(1);
});
it("preserves legacy identity settings and explicit email consent when resuming a saved introduction", async () => {
  mount(profile);
  await fill();
  await preview();
  expect(api.saveTutorIntroduction).toHaveBeenCalledWith(
    expect.objectContaining({
      identity_country: "OTHER",
      identity_document: "PASSPORT",
      public_email_consent: true,
      expected_public_revision: 1,
    }),
  );
});
it("keeps a blocked publication private and shows the server error", async () => {
  vi.mocked(api.listingAction).mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 403,
      code: "SAFETY_RESTRICTED",
      message: "This account is restricted.",
    },
  });
  mount();
  await fill();
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Publish for free" }));
  await screen.findByText("This account is restricted.");
  expect(screen.queryByText("Your ad is online")).not.toBeInTheDocument();
  expect(api.clearTutorOnboardingDraft).not.toHaveBeenCalled();
});
it("does not hide catalogue failures or proceed to publication", async () => {
  vi.mocked(api.createListing).mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 400,
      code: "INVALID_CATALOGUE",
      message: "Choose an active teaching combination.",
    },
  });
  mount();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByText("Choose an active teaching combination.");
  expect(api.listingAction).not.toHaveBeenCalled();
});
it("retains the published success state when clearing a private working copy fails", async () => {
  vi.mocked(api.clearTutorOnboardingDraft).mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 409,
      code: "REVISION_CONFLICT",
      message: "Draft changed elsewhere.",
    },
  });
  mount();
  await fill();
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Publish for free" }));
  await screen.findByText("Your ad is online. A private working copy remains saved.");
  expect(api.listingAction).toHaveBeenCalledTimes(1);
});
it("asks for school details only when relevant and preserves the 12-word title rule", async () => {
  mount();
  await fill();
  fireEvent.change(screen.getByLabelText("Ad title"), {
    target: { value: "Short Physics lessons only" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByText("Use 12 or more words in an ad title of at most 160 characters.");
  expect(api.createListing).not.toHaveBeenCalled();
});

it("uploads a consented photo on preview without publishing anything", async () => {
  const upload = vi.spyOn(api, "uploadTutorPhoto").mockResolvedValue(success({ photo: usable }));
  mount();
  await fill();
  const file = new File(["fictional-image"], "portrait.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  fireEvent.change(screen.getByLabelText("Replace photo (optional)"), {
    target: { files: [file] },
  });
  fireEvent.click(
    screen.getByLabelText(
      "This is my own adult portrait, and I agree to show it publicly after approval.",
    ),
  );
  await preview();
  expect(upload).toHaveBeenCalledExactlyOnceWith("image/png", "AQID");
  expect(api.listingAction).not.toHaveBeenCalled();
  expect(ads[0]?.status).toBe("DRAFT");
});

it("does not create an ad when the photo upload fails", async () => {
  vi.spyOn(api, "uploadTutorPhoto").mockResolvedValue({
    ok: false,
    error: {
      kind: "http",
      status: 503,
      code: "SCANNER_UNAVAILABLE",
      message: "Scanning is unavailable.",
    },
  });
  mount();
  await fill();
  const file = new File(["fictional-image"], "portrait.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });
  fireEvent.change(screen.getByLabelText("Replace photo (optional)"), {
    target: { files: [file] },
  });
  fireEvent.click(
    screen.getByLabelText(
      "This is my own adult portrait, and I agree to show it publicly after approval.",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByText("The account service had a problem. Please try again shortly.");
  expect(api.createListing).not.toHaveBeenCalled();
  expect(api.listingAction).not.toHaveBeenCalled();
});

it("recovers a draft created before a lost response without creating a duplicate", async () => {
  const original = vi.mocked(api.createListing).getMockImplementation()!;
  vi.mocked(api.createListing).mockImplementationOnce(async (offer) => {
    await original(offer);
    return { ok: false, error: { kind: "unavailable" } };
  });
  mount();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "Preview my ad" }));
  await screen.findByText("Account service is not connected. Please try again later.");
  await preview();
  expect(api.createListing).toHaveBeenCalledTimes(1);
  expect(ads).toHaveLength(1);
  expect(api.listingAction).not.toHaveBeenCalled();
});

it("lets an incomplete form be saved without creating a profile or requiring a photo", async () => {
  mount();
  await screen.findByRole("heading", { name: "Start teaching" });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved privately. Finish the remaining fields when you return.");
  expect(api.saveTutorIntroduction).not.toHaveBeenCalled();
  expect(api.uploadTutorPhoto).not.toHaveBeenCalled();
  expect(api.createListing).not.toHaveBeenCalled();
  expect(api.listingAction).not.toHaveBeenCalled();
});

it("preserves closed availability and does not promise enquiries for an unavailable published ad", async () => {
  vi.mocked(api.tutorPresence).mockResolvedValue(
    success({
      presence: {
        revision: 1,
        location: null,
        teaching_modes: ["ONLINE"],
        accepting_students: false,
        weekly_slots: [],
        timezone: "Asia/Kolkata",
        updated_at: null,
      },
    }),
  );
  vi.mocked(api.listingAction).mockImplementation(async (id, revision) =>
    success({
      listing: {
        ...ads.find((a) => a.id === id)!,
        status: "PUBLISHED",
        eligible: false,
        revision: revision + 1,
      },
    }),
  );
  mount();
  await fill();
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "Publish for free" }));
  await screen.findByRole("heading", { name: "Your ad is published" });
  expect(screen.getByText(/currently unavailable for enquiries/)).toBeVisible();
  expect(api.saveTutorPresence).toHaveBeenCalledWith(
    expect.objectContaining({ accepting_students: false }),
  );
});

it("ignores a late StrictMode initial response after the Tutor has started typing", async () => {
  const answers: ((r: Awaited<ReturnType<typeof api.tutorOnboardingDraft>>) => void)[] = [];
  vi.mocked(api.tutorOnboardingDraft).mockImplementation(
    () => new Promise((resolve) => answers.push(resolve)),
  );
  render(
    <StrictMode>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SimpleTutorSetup catalogue={catalogue} />
      </QueryClientProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(answers).toHaveLength(2));
  await act(async () => answers[1]!(success({ draft: null })));
  await fill();
  await act(async () => answers[0]!(success({ draft: null })));
  expect(screen.getByLabelText("Subject", { exact: true })).toHaveValue("subject-physics");
  expect(screen.getByLabelText("About you and your classes")).toHaveValue(
    "Patient Physics classes.",
  );
});

it("does not reset a working form when the parent refreshes its catalogue object", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (data: Catalogue) => (
    <QueryClientProvider client={client}>
      <SimpleTutorSetup catalogue={data} />
    </QueryClientProvider>
  );
  const view = render(tree(catalogue));
  await fill();
  view.rerender(tree({ ...catalogue, terms: [...catalogue.terms] }));
  expect(screen.getByLabelText("Subject", { exact: true })).toHaveValue("subject-physics");
  expect(api.tutorOnboardingDraft).toHaveBeenCalledTimes(1);
});
