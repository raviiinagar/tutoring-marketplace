import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Route as SignupRoute } from "@/routes/auth.signup";
import { Route as ResetRoute } from "@/routes/auth.reset-password";
import { PASSWORD_LENGTH_GUIDANCE } from "@/lib/validation";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/components/account/ui", async () => ({
  ...(await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui")),
  AuthShell: ({
    children,
    intro,
    aside,
  }: {
    children: React.ReactNode;
    intro?: React.ReactNode;
    aside?: React.ReactNode;
  }) => (
    <main>
      {aside}
      {intro}
      {children}
    </main>
  ),
}));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
it("signup and reset show the same password-length rule", async () => {
  const Signup = SignupRoute.options.component!;
  const Reset = ResetRoute.options.component!;
  render(<Signup />);
  expect(screen.getByText(PASSWORD_LENGTH_GUIDANCE)).toBeTruthy();
  cleanup();
  window.history.replaceState(null, "", "/auth/reset-password#token=" + "a".repeat(43));
  render(<Reset />);
  expect(
    await screen.findByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent === PASSWORD_LENGTH_GUIDANCE + " Resetting signs out every device.",
    ),
  ).toBeTruthy();
});

it("tells parents to use their own account, with no separate child profile", () => {
  const Signup = SignupRoute.options.component!;
  render(<Signup />);
  // ADR0015: adult-only accounts. The guidance sits in the panel's lead, which also shows on phones.
  expect(
    screen.getByText(
      "One free account to learn, to teach, or both. Parents book classes for their child from their own account; no separate child profile is needed.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/later update/i)).toBeNull();
});
