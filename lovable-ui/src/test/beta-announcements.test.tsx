import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnnouncementTicker } from "@/components/beta-announcements";
import { api, type CommunityPolicy, type FeedbackPolicy } from "@/lib/api";

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      to,
      children,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

const community = (enabled: boolean) => ({
  ok: true as const,
  status: 200,
  data: {
    enabled,
    rules_version: "test",
    reactions: [],
    max_message_length: 1000,
    rules: [],
  } as CommunityPolicy,
});
const feedback = (enabled: boolean) => ({
  ok: true as const,
  status: 200,
  data: {
    enabled,
    screenshots_enabled: false,
    categories: [],
    public_categories: [],
    statuses: [],
    max_screenshot_bytes: 0,
    notice: "",
  } as FeedbackPolicy,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementTicker />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
  vi.spyOn(api, "communityPolicy").mockResolvedValue(community(true));
  vi.spyOn(api, "feedbackPolicy").mockResolvedValue(feedback(true));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("announces the beta features with one focusable link each and a hidden scrolling copy", () => {
  mount();
  const bar = screen.getByRole("region", { name: "Announcements" });
  expect(within(bar).getByRole("link", { name: "Join the community" })).toHaveAttribute(
    "href",
    "/community",
  );
  expect(within(bar).getByRole("link", { name: "Send feedback" })).toHaveAttribute(
    "href",
    "/feedback",
  );
  // The duplicate list that makes the loop seamless is hidden from assistive technology and the tab order.
  expect(within(bar).getAllByRole("link")).toHaveLength(3);
  const copies = bar.querySelectorAll("ul[aria-hidden='true'] a");
  expect(copies).toHaveLength(3);
  copies.forEach((link) => expect(link).toHaveAttribute("tabindex", "-1"));
});

it("can be paused and dismissed, and stays dismissed", () => {
  const { unmount } = mount();
  const bar = screen.getByRole("region", { name: "Announcements" });
  const pause = within(bar).getByRole("button", { name: "Pause announcements" });
  expect(pause).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(pause);
  expect(pause).toHaveAttribute("aria-pressed", "true");
  expect(bar).toHaveAttribute("data-paused");
  fireEvent.click(within(bar).getByRole("button", { name: "Dismiss announcements" }));
  expect(screen.queryByRole("region", { name: "Announcements" })).toBeNull();
  unmount();
  mount();
  expect(screen.queryByRole("region", { name: "Announcements" })).toBeNull();
});

it("drops announcements for a feature switched off, and disappears when both are off", async () => {
  vi.mocked(api.communityPolicy).mockResolvedValue(community(false));
  const { unmount } = mount();
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "Join the community" })).toBeNull(),
  );
  expect(screen.getByRole("link", { name: "Send feedback" })).toBeVisible();
  unmount();
  vi.mocked(api.feedbackPolicy).mockResolvedValue(feedback(false));
  mount();
  await waitFor(() => expect(screen.queryByRole("region", { name: "Announcements" })).toBeNull());
});
