import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OperationsDesk } from "@/components/operations";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires an audited purpose, shows unresolved conditions, and pauses checkout through the versioned command", async () => {
  let paused = false,
    expired = false;
  const commands: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/access"))
      return Response.json({ authenticated: true, scopes: ["FINANCE"], expires_at: null });
    if (expired)
      return Response.json(
        { code: "STAFF_MFA_REQUIRED", message: "Verify MFA again." },
        { status: 403 },
      );
    if (String(url).endsWith("/checkout")) {
      commands.push(JSON.parse(String(init?.body)));
      paused = true;
      return Response.json({
        checkout: { paused: true, revision: 2 },
        correlation_id: "command-correlation",
      });
    }
    return Response.json({
      as_of: new Date().toISOString(),
      scope: "FINANCE",
      test_only: true,
      checkout: { paused, revision: paused ? 2 : 1 },
      routing: { email: "CONFIG_REQUIRED", sms: false, outside_support_hours: true },
      monitor: { checked_at: new Date().toISOString() },
      alerts: [
        {
          id: "alert-1",
          code: "UNKNOWN_PAYMENTS",
          status: "OPEN",
          scope: "FINANCE",
          count: 1,
          opened_at: new Date().toISOString(),
        },
      ],
      jobs: [
        {
          kind: "PAYMENT_EVENT",
          id: "evt_fictional",
          status: "PENDING",
          created_at: new Date().toISOString(),
          attempts: 3,
          recovery: "REPLAY",
        },
      ],
      observations: [],
      replays: [],
      job_limit: 100,
    });
  });
  render(<OperationsDesk />);
  const load = await screen.findByRole("button", { name: "Inspect operations" });
  expect(load).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason for operations access"), {
    target: { value: "Inspect unknown payment before safe recovery" },
  });
  fireEvent.click(load);
  expect(await screen.findByText("Unknown payment outcomes")).toBeTruthy();
  expect(screen.getByText(/Owner email routing needs configuration/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pause new checkout" }));
  await waitFor(() => expect(commands.length).toBe(1));
  expect(commands[0]).toMatchObject({
    paused: true,
    revision: 1,
    reason: "Inspect unknown payment before safe recovery",
  });
  expect(await screen.findByRole("button", { name: "Resume new checkout" })).toBeTruthy();
  expired = true;
  fireEvent.click(load);
  await waitFor(() => expect(screen.queryByText("Unknown payment outcomes")).toBeNull());
});
