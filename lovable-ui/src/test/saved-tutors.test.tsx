import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type SavedTutorItem, type User } from "@/lib/api";
import { SaveTutorButton } from "@/components/save-tutor-button";
import { SavedTutorList } from "@/components/saved-tutors";
import { PublicTutorCard } from "@/components/public-tutor-profiles";
import { accountSessionKey } from "@/lib/session";
import { savedTutorsForAccount } from "@/lib/saved-tutors";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
const id = "44444444-4444-4444-8444-444444444444";
const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "Adult learner",
  email: "learner@example.invalid",
  email_verified: true,
  created_at: "2026-11-02T00:00:00Z",
  roles: ["LEARNER"],
};
const unavailable: SavedTutorItem = {
  profile_id: id,
  saved_at: "2026-11-02T00:00:00Z",
  profile: null,
};
let items: SavedTutorItem[];
const clients: QueryClient[] = [];
function mount(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const result = render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
  return { client, ...result };
}
beforeEach(() => {
  items = [];
  vi.spyOn(api, "me").mockResolvedValue({ ok: true, status: 200, data: { user } });
  vi.spyOn(api, "savedTutors").mockImplementation(async () => ({
    ok: true,
    status: 200,
    data: { items, limit: 50 },
  }));
  vi.spyOn(api, "catalogue").mockResolvedValue({
    ok: true,
    status: 200,
    data: { domains: [], terms: [] },
  });
  vi.spyOn(api, "saveTutorToShortlist").mockImplementation(async (profile_id) => {
    items = [{ ...unavailable, profile_id }];
    return { ok: true, status: 200, data: { saved: true, profile_id } };
  });
  vi.spyOn(api, "removeSavedTutor").mockImplementation(async (profile_id) => {
    items = [];
    return { ok: true, status: 200, data: { saved: false, profile_id } };
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});

it("anonymous heart offers sign-in without creating a browser or server shortlist", async () => {
  vi.mocked(api.me).mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "AUTH_REQUIRED", message: "Sign in" },
  });
  mount(<SaveTutorButton profileId={id} displayName="Asha" />);
  const button = screen.getByRole("button", { name: "Save Asha to saved Tutors" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByRole("link", { name: "Sign in to save this Tutor" })).toHaveAttribute(
    "href",
    "/auth/signin",
  );
  expect(api.savedTutors).not.toHaveBeenCalled();
  expect(api.saveTutorToShortlist).not.toHaveBeenCalled();
});
it("saving and removing updates the shared server-derived heart status", async () => {
  mount(<SaveTutorButton profileId={id} displayName="Asha" />);
  const button = screen.getByRole("button", { name: "Save Asha to saved Tutors" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Remove Asha from saved Tutors" });
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(api.saveTutorToShortlist).toHaveBeenCalledWith(id);
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByRole("button", { name: "Save Asha to saved Tutors" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(api.removeSavedTutor).toHaveBeenCalledWith(id);
});
it("failed removal keeps the saved heart and displays the server error", async () => {
  items = [unavailable];
  vi.mocked(api.removeSavedTutor).mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 503, code: "UNAVAILABLE", message: "Please retry shortly." },
  });
  mount(<SaveTutorButton profileId={id} displayName="Asha" />);
  const button = await screen.findByRole("button", { name: "Remove Asha from saved Tutors" });
  fireEvent.click(button);
  await screen.findByRole("alert");
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(items).toHaveLength(1);
});
it("saved page explains empty state and unavailable profiles can be removed without a stale snapshot", async () => {
  items = [unavailable];
  mount(<SavedTutorList />);
  await screen.findByRole("heading", { name: "Tutor currently unavailable" });
  fireEvent.click(screen.getByRole("button", { name: "Remove unavailable Tutor" }));
  await screen.findByRole("heading", { name: "Your shortlist starts here" });
  expect(api.removeSavedTutor).toHaveBeenCalledWith(id);
});
it("failed saved-list reads show a retry state rather than an empty list", async () => {
  vi.mocked(api.savedTutors).mockResolvedValueOnce({
    ok: false,
    error: { kind: "http", status: 503, code: "UNAVAILABLE", message: "Please retry shortly." },
  });
  mount(<SavedTutorList />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Your shortlist starts here")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry saved Tutors" }));
  await screen.findByRole("heading", { name: "Your shortlist starts here" });
});
it("switching accounts never renders another account’s cached shortlist", async () => {
  items = [unavailable];
  const { client } = mount(<SavedTutorList />);
  await screen.findByRole("heading", { name: "Tutor currently unavailable" });
  items = [];
  client.setQueryData(accountSessionKey, {
    ok: true,
    status: 200,
    data: { user: { ...user, id: "22222222-2222-4222-8222-222222222222" } },
  });
  await screen.findByRole("heading", { name: "Your shortlist starts here" });
  expect(screen.queryByText("Tutor currently unavailable")).toBeNull();
  await waitFor(() => expect(client.getQueryData(savedTutorsForAccount(user.id))).toBeUndefined());
});
it("card heart is a separate control outside the profile link", async () => {
  mount(
    <PublicTutorCard
      profile={{
        id,
        display_name: "Asha",
        biography: "Patient teaching",
        subject_ids: ["subject-physics"],
        hourly_rate_paise: 50000,
        currency: "INR",
        identity_label: "Identity reviewed",
        expertise_label: "Self-declared",
        photo_url: null,
        contact: null,
        contact_status: "NOT_PUBLIC",
        offers: [],
      }}
    />,
  );
  const button = screen.getByRole("button", { name: "Save Asha to saved Tutors" });
  await waitFor(() => expect(button).toBeEnabled());
  expect(button.closest("a")).toBeNull();
});
