import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RequestDeadline } from "@/components/request-deadline";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("closes response actions at the server deadline even when the device clock is wrong", () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  render(
    <RequestDeadline
      request={{
        status: "PENDING",
        server_time: "2026-10-15T08:00:00.000Z",
        expires_at: "2026-10-15T08:00:01.000Z",
      }}
    >
      {(pending) => <button disabled={!pending}>Accept enquiry</button>}
    </RequestDeadline>,
  );
  expect(screen.getByRole("button", { name: "Accept enquiry" }).hasAttribute("disabled")).toBe(
    false,
  );
  expect(screen.getByText(/less than 24 hours/)).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("Status: EXPIRED")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Accept enquiry" }).hasAttribute("disabled")).toBe(
    true,
  );
});
