import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareTutorButton, tutorProfileUrl } from "@/components/share-tutor-button";
const id = "44444444-4444-4444-8444-444444444444";
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share"),
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const [key, original] of [
    ["share", originalShare],
    ["clipboard", originalClipboard],
  ] as const) {
    if (original) Object.defineProperty(navigator, key, original);
    else Reflect.deleteProperty(navigator, key);
  }
});
function methods(share: unknown, clipboard: unknown) {
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
}
it("canonical links contain only the selected public profile path", () => {
  expect(tutorProfileUrl("https://tutors.example/path?private=value#fragment", id)).toBe(
    "https://tutors.example/profiles/" + id,
  );
});
it("shares the own-origin canonical public profile with native sharing", async () => {
  const share = vi.fn().mockResolvedValue(undefined),
    copy = vi.fn();
  methods(share, { writeText: copy });
  render(<ShareTutorButton profileId={id} displayName="Asha" />);
  fireEvent.click(screen.getByRole("button", { name: "Share profile" }));
  await screen.findByText("Profile shared.");
  expect(share).toHaveBeenCalledWith({
    title: "Asha — Tutor profile",
    url: window.location.origin + "/profiles/" + id,
  });
  expect(copy).not.toHaveBeenCalled();
});
it("copies a link when native sharing is unsupported", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  methods(undefined, { writeText: copy });
  render(<ShareTutorButton profileId={id} displayName="Asha" />);
  fireEvent.click(screen.getByRole("button", { name: "Share profile" }));
  await screen.findByText("Profile link copied.");
  expect(copy).toHaveBeenCalledWith(window.location.origin + "/profiles/" + id);
});
it("offers a selectable manual link when both share and clipboard fail", async () => {
  methods(vi.fn().mockRejectedValue(new Error("Not supported")), {
    writeText: vi.fn().mockRejectedValue(new Error("Denied")),
  });
  render(<ShareTutorButton profileId={id} displayName="Asha" />);
  fireEvent.click(screen.getByRole("button", { name: "Share profile" }));
  const input = await screen.findByRole("textbox", { name: "Profile link" });
  expect(input).toHaveValue(window.location.origin + "/profiles/" + id);
  expect(input).toHaveAttribute("readonly");
});
it("cancelling the native share sheet is silent and does not copy unexpectedly", async () => {
  const copy = vi.fn();
  methods(vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")), {
    writeText: copy,
  });
  render(<ShareTutorButton profileId={id} displayName="Asha" />);
  fireEvent.click(screen.getByRole("button", { name: "Share profile" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Share profile" })).toBeEnabled());
  expect(copy).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});
