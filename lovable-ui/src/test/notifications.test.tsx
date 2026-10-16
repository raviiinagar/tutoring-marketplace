import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationSettings } from "@/components/notification-settings";
import { NotificationOperations } from "@/components/notification-operations";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("saves explicit optional preferences while financial service notices remain enabled", async () => {
  let body: Record<string, unknown> | undefined;
  const preferences = {
    enquiry_email: true,
    chat_email: true,
    availability_email: true,
    marketing_email: false,
    notice_version: "notification-preferences-v1",
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (init?.method === "POST") {
      body = JSON.parse(String(init.body));
      Object.assign(preferences, body);
    }
    return Response.json(
      String(input).includes("notification-preferences")
        ? {
            preferences,
            service_email: true,
            policy: { notice: "Financial service notices remain enabled." },
          }
        : { notifications: [], delivery_mode: "LOCAL_CAPTURE" },
    );
  });
  render(<NotificationSettings />);
  const chat = await screen.findByLabelText("New private messages");
  expect(
    (screen.getByLabelText("Financial and security notices") as HTMLInputElement).disabled,
  ).toBe(true);
  expect((screen.getByLabelText("Marketing updates") as HTMLInputElement).checked).toBe(false);
  fireEvent.click(chat);
  expect(body).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(body?.['chat_email']).toBe(false));
  expect(body).not.toHaveProperty("service_email");
  expect(await screen.findByText("Preferences saved.")).toBeTruthy();
  expect(screen.getByText(/saved locally/)).toBeTruthy();
});
it("requires original provider proof for an unknown SMS instead of offering resend", async () => {
  let posts = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    if (init?.method === "POST") posts++;
    return Response.json({
      notifications: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          template: "OPERATOR_REFUND_ALERT",
          template_version: "service-v1",
          channel: "SMS",
          status: "UNKNOWN",
          created_at: "2026-10-17T00:00:00Z",
          attempts: 1,
          last_error: "SMS_PROVIDER_RESULT_UNKNOWN",
        },
      ],
      sms_configured: true,
      sms_daily_limit: 5,
      delivery_mode: "PROVIDER",
    });
  });
  render(<NotificationOperations />);
  fireEvent.change(screen.getByLabelText("Reason for notification access"), {
    target: { value: "Review uncertain critical notification" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Inspect delivery queue" }));
  expect(await screen.findByText("Provider outcome unknown", { exact: false })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry existing notification" })).toBeNull();
  const proof = screen.getByRole("button", { name: "Verify original provider outcome" });
  expect((proof as HTMLButtonElement).disabled).toBe(true);
  expect(posts).toBe(0);
});
