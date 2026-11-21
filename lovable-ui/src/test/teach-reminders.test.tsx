import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { Route } from "@/routes/reminders.stop";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/account/ui", async () => ({
  ...(await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui")),
  AuthShell: ({
    title,
    children,
    footer,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
      {footer}
    </main>
  ),
}));
const token = "MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAx." + "a".repeat(43);
const Page = Route.options.component!;
beforeEach(() => {
  vi.spyOn(api, "stopTeachReminders").mockResolvedValue({
    ok: true,
    status: 200,
    data: { stopped: true },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

it("stops reminders only when the button is pressed, and removes the token from the address", async () => {
  window.history.replaceState(null, "", "/reminders/stop#token=" + token);
  render(<Page />);
  const button = await screen.findByRole("button", { name: "Stop these reminders" });
  // Opening the link (as mail scanners do) changes nothing.
  expect(api.stopTeachReminders).not.toHaveBeenCalled();
  expect(window.location.hash).toBe("");
  fireEvent.click(button);
  expect(await screen.findByRole("heading", { name: "Reminders stopped" })).toBeVisible();
  expect(api.stopTeachReminders).toHaveBeenCalledExactlyOnceWith(token);
  expect(screen.getByRole("link", { name: "Email settings" })).toHaveAttribute(
    "href",
    "/notifications",
  );
});

it("explains an incomplete link instead of sending it", async () => {
  window.history.replaceState(null, "", "/reminders/stop#token=broken");
  render(<Page />);
  expect(await screen.findByText(/Open the complete link from your reminder email/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Stop these reminders" })).toBeNull();
  expect(api.stopTeachReminders).not.toHaveBeenCalled();
});
