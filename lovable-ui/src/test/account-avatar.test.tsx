import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountAvatar } from "@/components/account-avatar";
import { TutorPhotoEditor } from "@/components/tutor-photo-editor";
import { api, type TutorPhotoState, type User } from "@/lib/api";
import { accountPhotoKey, updateAccountPhoto } from "@/lib/account-photo";
import { accountSessionKey } from "@/lib/session";

const user: User = {
  id: "owner-a",
  display_name: "Fictional Tutor",
  email: "a@example.test",
  roles: ["LEARNER", "TUTOR"],
  email_verified: true,
  created_at: "2026-11-06",
};
const policy: TutorPhotoState["policy"] = {
  auto_publication: true,
  uploads_enabled: true,
  test_only: true,
  max_bytes: 1048576,
  media_types: ["image/png"],
  notice: "Fictional portrait",
};
const portrait: NonNullable<TutorPhotoState["photo"]> = {
  id: "portrait-a",
  scan_status: "CLEAN",
  status: "PENDING",
  self_published: true,
  test_only: true,
  review_reason: null,
};
const clients: QueryClient[] = [];
function mount(children: React.ReactNode, owner = user) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData(accountSessionKey, { ok: true, status: 200, data: { user: owner } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return { client, ...view };
}
beforeEach(() => {
  vi.spyOn(api, "me").mockResolvedValue({ ok: true, status: 200, data: { user } });
  vi.spyOn(api, "tutorPhoto").mockResolvedValue({
    ok: true,
    status: 200,
    data: { policy, photo: portrait },
  });
});
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});

it.each(["PENDING", "APPROVED"] as const)(
  "uses the saved CLEAN %s owner portrait even without public publication",
  async (status) => {
    vi.mocked(api.tutorPhoto).mockResolvedValue({
      ok: true,
      status: 200,
      data: { policy, photo: { ...portrait, status, self_published: false } },
    });
    mount(<AccountAvatar user={user} />);
    expect(await screen.findByAltText("Your profile photo")).toHaveAttribute(
      "src",
      api.photoPreviewUrl(portrait.id),
    );
  },
);
it.each([
  null,
  { ...portrait, status: "REJECTED" as const },
  { ...portrait, status: "REMOVED" as const },
  { ...portrait, scan_status: "ERROR" as const },
  { ...portrait, scan_status: "REJECTED" as const },
])("uses initials when no usable stored portrait exists: %j", async (photo) => {
  vi.mocked(api.tutorPhoto).mockResolvedValue({ ok: true, status: 200, data: { policy, photo } });
  mount(<AccountAvatar user={user} />);
  expect(await screen.findByText("F")).toBeTruthy();
  expect(screen.queryByAltText("Your profile photo")).toBeNull();
});
it("never requests Tutor photos for an account without the role", async () => {
  const learner = { ...user, roles: ["LEARNER"] as User["roles"] };
  mount(<AccountAvatar user={learner} />, learner);
  expect(await screen.findByText("F")).toBeTruthy();
  expect(api.tutorPhoto).not.toHaveBeenCalled();
});
it("does not display a late prior-account photo after switching accounts", async () => {
  let finish!: (value: Awaited<ReturnType<typeof api.tutorPhoto>>) => void;
  vi.mocked(api.tutorPhoto).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, rerender } = mount(<AccountAvatar user={user} />);
  await waitFor(() => expect(api.tutorPhoto).toHaveBeenCalledOnce());
  const other = { ...user, id: "owner-b", display_name: "Other Tutor" };
  const replacement = { ...portrait, id: "portrait-b" };
  vi.mocked(api.tutorPhoto).mockResolvedValue({
    ok: true,
    status: 200,
    data: { policy, photo: replacement },
  });
  act(() =>
    client.setQueryData(accountSessionKey, { ok: true, status: 200, data: { user: other } }),
  );
  rerender(
    <QueryClientProvider client={client}>
      <AccountAvatar user={other} />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByAltText("Your profile photo")).toHaveAttribute(
      "src",
      api.photoPreviewUrl(replacement.id),
    ),
  );
  await act(async () => finish({ ok: true, status: 200, data: { policy, photo: portrait } }));
  expect(screen.getByAltText("Your profile photo")).toHaveAttribute(
    "src",
    api.photoPreviewUrl(replacement.id),
  );
});
it("falls back on an unusable image response and retries when authoritative photo data refreshes", async () => {
  const { client } = mount(<AccountAvatar user={user} />);
  fireEvent.error(await screen.findByAltText("Your profile photo"));
  expect(await screen.findByText("F")).toBeTruthy();
  vi.mocked(api.tutorPhoto).mockResolvedValue({
    ok: true,
    status: 200,
    data: { policy, photo: { ...portrait, id: "replacement" } },
  });
  await act(async () => {
    await client.invalidateQueries({ queryKey: accountPhotoKey(user.id) });
  });
  expect(await screen.findByAltText("Your profile photo")).toHaveAttribute(
    "src",
    api.photoPreviewUrl("replacement"),
  );
});
it("updates all mounted avatars after replacement/removal without publishing a profile or ad", async () => {
  let photo: TutorPhotoState["photo"] = portrait;
  vi.mocked(api.tutorPhoto).mockImplementation(async () => ({
    ok: true,
    status: 200,
    data: { policy, photo },
  }));
  vi.spyOn(api, "uploadTutorPhoto").mockImplementation(async () => {
    photo = { ...portrait, id: "replacement" };
    return { ok: true, status: 201, data: { photo } };
  });
  vi.spyOn(api, "removeTutorPhoto").mockImplementation(async () => {
    photo = null;
    return { ok: true, status: 204, data: undefined };
  });
  const publishAd = vi.spyOn(api, "listingAction");
  const publishProfile = vi.spyOn(api, "tutorPublication");
  mount(
    <>
      <AccountAvatar user={user} />
      <AccountAvatar user={user} />
      <AccountAvatar user={user} />
      <TutorPhotoEditor />
    </>,
  );
  await waitFor(() => expect(screen.getAllByAltText("Your profile photo")).toHaveLength(3));
  expect(api.tutorPhoto).toHaveBeenCalledOnce();
  const file = new File(["fictional photo"], "portrait.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode("fictional photo").buffer,
  });
  fireEvent.change(screen.getByLabelText("Portrait image"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("checkbox", { name: /This is my own adult portrait/ }));
  fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
  await waitFor(() => {
    for (const image of screen.getAllByAltText("Your profile photo"))
      expect(image).toHaveAttribute("src", api.photoPreviewUrl("replacement"));
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  await waitFor(() => expect(screen.queryAllByAltText("Your profile photo")).toHaveLength(0));
  expect(publishAd).not.toHaveBeenCalled();
  expect(publishProfile).not.toHaveBeenCalled();
});

it("ignores an upload response belonging to an account that has signed out", () => {
  const { client } = mount(<AccountAvatar user={user} />);
  act(() =>
    client.setQueryData(accountSessionKey, {
      ok: false,
      error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Signed out" },
    }),
  );
  act(() => updateAccountPhoto(client, user.id, { policy, photo: portrait }));
  expect(client.getQueryData(accountPhotoKey(user.id))).toBeUndefined();
  expect(screen.queryByAltText("Your profile photo")).toBeNull();
});
