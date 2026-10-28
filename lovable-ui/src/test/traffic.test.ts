import { afterEach, expect, it, vi } from "vitest";
import { publicPage, trafficObservation } from "@/lib/traffic";
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("only observes public page categories, never private paths or query payloads", () => {
  for (const path of [
    "/staff",
    "/staff/finance",
    "/learners",
    "/chat/id",
    "/connections/id",
    "/auth/reset-password",
    "/auth/verify",
  ])
    expect(publicPage(path)).toBeUndefined();
  expect(publicPage("/")).toBe("HOME");
  expect(publicPage("/teachers/physics-00000000-0000-4000-8000-000000000000")).toBe("TUTOR");
  expect(publicPage("/learn/school/subject-physics")).toBe("CATEGORY");
  expect(publicPage("/auth/signup")).toBe("SIGN_UP");
  const body = trafficObservation("/teachers/physics-private-slug", sessionStorage, 1000)!;
  expect(Object.keys(body).sort()).toEqual(["event_id", "page", "session_id"]);
  expect(JSON.stringify(body)).not.toContain("private-slug");
});
it("keeps a tab session for observed activity and rotates it after 30 minutes of inactivity", () => {
  const first = trafficObservation("/", sessionStorage, 1000)!;
  const second = trafficObservation("/tutors", sessionStorage, 2000)!;
  expect(first.session_id).toBe(second.session_id);
  expect(first.event_id).not.toBe(second.event_id);
  const next = trafficObservation("/", sessionStorage, 2000 + 30 * 60000)!;
  expect(next.session_id).not.toBe(first.session_id);
});
it("ignores corrupt session state and does not create receipts for private pages", () => {
  sessionStorage.setItem("tm-public-visit", "broken");
  expect(trafficObservation("/", sessionStorage, 1000)?.session_id).toBeTruthy();
  const before = sessionStorage.getItem("tm-public-visit");
  expect(trafficObservation("/staff", sessionStorage, 2000)).toBeUndefined();
  expect(sessionStorage.getItem("tm-public-visit")).toBe(before);
});
