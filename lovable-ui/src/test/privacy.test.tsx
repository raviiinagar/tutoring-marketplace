import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PrivacyDesk, PrivacyOperations } from "@/components/privacy";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("uses the privacy-authorized child list when marketplace access is restricted", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("/learners")
      ? Response.json(
          { code: "ACCOUNT_RESTRICTED", message: "Marketplace restricted." },
          { status: 403 },
        )
      : Response.json({
          authenticated: true,
          policy: { ...policy, withdrawal_enabled: true },
          requests: [],
          child_profiles: [{ id: "owned-child", alias: "Fictional child" }],
        }),
  );
  render(<PrivacyDesk />);
  expect(await screen.findByRole("option", { name: "Fictional child" })).toBeTruthy();
});
const policy = {
  exports_enabled: true,
  deletion_enabled: false,
  withdrawal_enabled: false,
  retention_policy: null,
  notice: "Approved retained records stay private.",
  export_expires_hours: 24,
  verification_minutes: 5,
};
const requestRow = {
  id: "export-one",
  kind: "EXPORT",
  status: "QUEUED",
  created_at: "2026-10-17T10:00:00Z",
  result: {},
};
it("requires a password proof before export and disables erasure without an approved policy", async () => {
  const writes: { url: string; body: any }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "POST") {
      writes.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json(
        String(url).endsWith("/verifications")
          ? { proof: "proof-one", expires_at: "2026-10-17T10:05:00Z" }
          : { request: requestRow },
      );
    }
    return Response.json(
      String(url).endsWith("/learners")
        ? { profiles: [] }
        : { authenticated: true, policy, requests: writes.length ? [requestRow] : [] },
    );
  });
  render(<PrivacyDesk />);
  expect(
    await screen.findByText("Retention policy approval is pending. Export is available."),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "private-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request data export" }));
  await waitFor(() => expect(writes.length).toBe(2));
  expect(writes[0]?.body.purpose).toBe("EXPORT");
  expect(writes[1]?.body.verification).toBe("proof-one");
  expect(writes[1]?.body.request_key).toBeTruthy();
  expect(writes[1]?.body.password).toBeUndefined();
  expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  expect(screen.getByLabelText("Current password")).toHaveValue("");
});
it("shows a read-only deletion receipt without exposing export download or mutation controls", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async(_url,init)=>init?.method==='DELETE'?new Response(null,{status:204}):
    Response.json({
      authenticated: false,
      policy,
      requests: [{ ...requestRow, kind: "DELETE", status: "COMPLETED" }],
    }),
  );
  render(<PrivacyDesk />);
  expect(await screen.findByText("Read-only request tracking")).toBeTruthy();
  expect(screen.getByText("COMPLETED")).toBeTruthy();
  expect(screen.queryByLabelText("Current password")).toBeNull();
  expect(screen.queryByRole("button", { name: "Request data export" })).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Forget tracking on this browser'}));
  expect(await screen.findByText('Request tracking cleared from this browser.')).toBeTruthy();
  expect(screen.queryByText('Loading privacy requests...')).toBeNull();
});
it("requires MFA and a purpose before staff inspection and clears retained content on expiry", async () => {
  let expired = false,
    inspections = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/access"))
      return Response.json({ authenticated: true, scopes: ["TRUST"] });
    if (expired)
      return Response.json({ code: "STAFF_MFA_REQUIRED", message: "Verify MFA." }, { status: 401 });
    if (String(url).includes("/inspections")) {
      inspections++;
      return Response.json({
        record: { private: "fictional-private-evidence" },
        purpose: "Fictional test evidence purpose",
        expires_at: "2026-10-18T10:00:00Z",
      });
    }
    return Response.json({
      requests: [],
      retained: [
        {
          id: "retained-one",
          request_id: "delete-one",
          class: "EVIDENCE",
          purpose: "Fictional test evidence purpose",
          expires_at: "2026-10-18T10:00:00Z",
          purged: false,
          held: false,
          holds: [],
        },
      ],
    });
  });
  render(<PrivacyOperations />);
  const load = await screen.findByRole("button", { name: "Load privacy queue" });
  expect(load).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Purpose for access or decision"), {
    target: { value: "Investigating fictional deletion request" },
  });
  fireEvent.click(load);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect retained data" }));
  expect(await screen.findByText(/fictional-private-evidence/)).toBeTruthy();
  expect(inspections).toBe(1);
  expired = true;
  fireEvent.click(screen.getByRole("button", { name: "Load privacy queue" }));
  await waitFor(() => expect(screen.queryByText(/fictional-private-evidence/)).toBeNull());
});
