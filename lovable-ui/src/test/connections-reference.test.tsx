import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Connections } from "@/routes/connections";
import { api, type ConnectionSummary, type ApiResult } from "@/lib/api";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  createFileRoute: () => (options: unknown) => options,
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: { connectionId?: string };
    children: React.ReactNode;
  }) => (
    <a {...props} href={to.replace("$connectionId", params?.connectionId ?? "")}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/account/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui");
  return {
    ...actual,
    AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    ),
  };
});
const connection = (id: string, title: string, available = true): ConnectionSummary => ({
  id,
  request_id: "request-" + id,
  listing_id: "listing-" + id,
  offer: {
    title,
    description: "Fictional teaching offer",
    domain_id: "school",
    subject_id: "subject-physics",
    level_id: "level-class-10",
    curriculum_id: "curriculum-cbse",
    language_ids: ["language-english"],
    currency: "INR",
    teaching_mode: "ONLINE",
    rate_paise: 50000,
    rate_unit: "HOUR",
    trial_kind: "NONE",
  },
  status: "ACTIVE",
  available,
  unread_count: available ? 2 : null,
  unavailable_reason: available ? null : "ACCOUNT_RESTRICTED",
  created_at: "2026-11-05T00:00:00Z",
  test_only: false,
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

it("shows the honest empty inbox with a working teacher-search destination", async () => {
  vi.spyOn(api, "connections").mockResolvedValue({
    ok: true,
    status: 200,
    data: { connections: [], next_cursor: null },
  });
  render(<Connections />);
  expect(await screen.findByRole("heading", { name: "No message" })).toBeTruthy();
  expect(screen.getByText("No results", { exact: true })).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Search for a teacher" }).getAttribute("href"),
  ).toBe("/tutors");
  expect(screen.queryByRole("heading", { name: "Your conversations" })).toBeNull();
});

it("does not present loading or failed API reads as an empty successful inbox", async () => {
  let resolve!: (
    result: ApiResult<{ connections: ConnectionSummary[]; next_cursor: string | null }>,
  ) => void;
  vi.spyOn(api, "connections").mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<Connections />);
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "No message" })).toBeNull();
  await act(async () => {
    resolve({ ok: false, error: { kind: "unavailable" } });
  });
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "No message" })).toBeNull();
  expect(screen.queryByText("No results", { exact: true })).toBeNull();
});

it("filters actual conversations and preserves authorized chat versus unavailable detail destinations", async () => {
  vi.spyOn(api, "connections").mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      connections: [
        connection("active-id", "Fictional Physics teacher"),
        connection("held-id", "Fictional Guitar teacher", false),
      ],
      next_cursor: null,
    },
  });
  render(<Connections />);
  const active = await screen.findByRole("link", { name: /Fictional Physics teacher/ });
  expect(active.getAttribute("href")).toBe("/chat/active-id");
  expect(screen.getByRole("link", { name: /Fictional Guitar teacher/ }).getAttribute("href")).toBe(
    "/connections/held-id",
  );
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  PHYsics  " } });
  expect(screen.getByRole("link", { name: /Fictional Physics teacher/ })).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Fictional Guitar teacher/ })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "unmatched" } });
  expect(screen.getByText("No results", { exact: true })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Your conversations" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "No message" })).toBeNull();
});

it("redirects an expired account session to sign in", async () => {
  vi.spyOn(api, "connections").mockResolvedValue({
    ok: false,
    error: { kind: "http", status: 401, code: "UNAUTHENTICATED", message: "Please sign in." },
  });
  render(<Connections />);
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/signin", replace: true }));
});
