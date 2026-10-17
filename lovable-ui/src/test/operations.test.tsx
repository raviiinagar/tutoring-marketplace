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

it("keeps checkout blocked until Finance explicitly reviews recovery evidence", async () => {
  const commands: unknown[] = [];
  let released = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/access"))
      return Response.json({ authenticated: true, scopes: ["FINANCE"], expires_at: null });
    if (String(url).endsWith("/recovery-releases")) {
      commands.push(JSON.parse(String(init?.body)));
      released = true;
      return Response.json({ recovery_released: true, correlation_id: "recovery-review" });
    }
    return Response.json({
      as_of: new Date().toISOString(),
      scope: "FINANCE",
      test_only: true,
      checkout: { paused: true, revision: 2 },
      routing: { email: "CONFIGURED", sms: false, outside_support_hours: true },
      monitor: { checked_at: new Date().toISOString() },
      alerts: [],
      jobs: [],
      observations: [],
      replays: [],
      job_limit: 100,
      recoveries: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          state: released ? "RELEASED" : "MONEY_REVIEW",
          started_at: new Date().toISOString(),
          source_snapshot_at: new Date().toISOString(),
          privacy_reapplied_at: new Date().toISOString(),
          release_id: "fictional-release",
        },
      ],
    });
  });
  render(<OperationsDesk />);
  fireEvent.change(await screen.findByLabelText("Reason for operations access"), {
    target: { value: "Review isolated recovery evidence" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Inspect operations" }));
  const release = await screen.findByRole("button", { name: "Record recovery review" });
  expect(screen.getByRole("button", { name: "Resume new checkout" })).toBeDisabled();
  expect(release).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Completed reconciliation IDs"), {
    target: { value: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  });
  fireEvent.change(screen.getByLabelText("Recovery evidence reference"), {
    target: { value: "FICTIONAL-RECOVERY-BANK-REVIEW" },
  });
  fireEvent.change(screen.getByLabelText("Money checked through (your local time)"), {
    target: { value: "2026-10-17T12:00" },
  });
  fireEvent.click(
    screen.getByLabelText(
      "I checked provider payments, refunds and bank evidence for this recovery.",
    ),
  );
  fireEvent.click(release);
  await waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0]).toMatchObject({
    recovery_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reconciliation_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    provider_checked: true,
    refunds_checked: true,
    bank_checked: true,
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Resume new checkout" })).not.toBeDisabled(),
  );
});
