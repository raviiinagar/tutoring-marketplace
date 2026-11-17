import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { GoogleSignInButton, GoogleSignInNotice } from "@/components/google-sign-in";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

it("offers Google only when the server has it configured, returning to the given page", async () => {
  vi.spyOn(api, "authProviders").mockResolvedValue({
    ok: true,
    status: 200,
    data: { google: true },
  });
  wrap(<GoogleSignInButton returnTo="/teachers/physics-1" />);
  const link = await screen.findByRole("link", { name: "Continue with Google" });
  expect(link.getAttribute("href")).toContain(
    "/v1/auth/google/start?return_to=%2Fteachers%2Fphysics-1",
  );
  cleanup();
  vi.spyOn(api, "authProviders").mockResolvedValue({
    ok: true,
    status: 200,
    data: { google: false },
  });
  wrap(<GoogleSignInButton />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
});

it("explains each Google sign-in outcome and ignores unknown values", () => {
  const { rerender } = render(<GoogleSignInNotice outcome="cancelled" />);
  expect(screen.getByText("Google sign-in was cancelled.")).toBeTruthy();
  rerender(<GoogleSignInNotice outcome="account" />);
  expect(screen.getByText(/couldn't sign you in with that Google account/)).toBeTruthy();
  rerender(<GoogleSignInNotice outcome="<script>" />);
  expect(screen.queryByText(/Google/)).toBeNull();
});
