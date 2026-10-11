import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { validateDisplayName, validateEmail, validateNewPassword } from "@/lib/validation";
import { readFragmentToken } from "@/routes/auth.verify";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("validation", () => {
  it("display name is trimmed, 2–80 chars", () => {
    expect(validateDisplayName(" a ")).toBeDefined();
    expect(validateDisplayName("  Al  ")).toBeUndefined();
    expect(validateDisplayName("x".repeat(81))).toBeDefined();
  });
  it("email max 254", () => {
    expect(validateEmail("a@" + "b".repeat(250) + ".in")).toBeDefined();
    expect(validateEmail("veer@example.in")).toBeUndefined();
    expect(validateEmail("nope")).toBeDefined();
  });
  it("password 12–128, never trimmed", () => {
    expect(validateNewPassword("x".repeat(11))).toBeDefined();
    expect(validateNewPassword("          ab")).toBeUndefined();
    expect(validateNewPassword("x".repeat(129))).toBeDefined();
  });
});

describe("api adapter", () => {
  it("registration sends only the three fields with credentials", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(202, { code: "VERIFICATION_REQUIRED", message: "" }));
    await api.register({ display_name: "Veer", email: "v@e.in", password: " pw ", extra: 1 } as never);
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(init?.body as string)).toEqual({ display_name: "Veer", email: "v@e.in", password: " pw " });
  });
  it("sign-out 204 is ok without parsing JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    expect((await api.signOut()).ok).toBe(true);
  });
  it("network failure reports unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fail"));
    const r = await api.me();
    expect(r.ok === false && r.error.kind).toBe("unavailable");
  });
  it("401 from /v1/me is surfaced", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { code: "UNAUTHENTICATED", message: "", correlation_id: "c" }));
    const r = await api.me();
    expect(r.ok === false && r.error.kind === "http" && r.error.status).toBe(401);
  });
});

it("reads token from fragment", () => {
  expect(readFragmentToken("#token=abc")).toBe("abc");
  expect(readFragmentToken("")).toBeNull();
});
