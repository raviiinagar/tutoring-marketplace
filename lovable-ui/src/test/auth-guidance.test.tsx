import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Route as SignupRoute } from "@/routes/auth.signup";
import { Route as ResetRoute } from "@/routes/auth.reset-password";
import { PASSWORD_LENGTH_GUIDANCE } from "@/lib/validation";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/components/account/ui", async () => ({
  ...await vi.importActual<typeof import("@/components/account/ui")>("@/components/account/ui"),
  AuthShell: ({ children, intro }: { children: React.ReactNode; intro?: React.ReactNode }) => <main>{intro}{children}</main>,
}));
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
it("signup and reset show the same password-length rule", async () => {
  const Signup = SignupRoute.options.component!;
  const Reset = ResetRoute.options.component!;
  render(<Signup />);
  expect(screen.getByText(PASSWORD_LENGTH_GUIDANCE)).toBeTruthy();
  cleanup();
  window.history.replaceState(null, "", "/auth/reset-password#token=" + "a".repeat(43));
  render(<Reset />);
  expect(await screen.findByText((_, element) => element?.tagName === "P" && element.textContent === PASSWORD_LENGTH_GUIDANCE + " Resetting signs out every device.")).toBeTruthy();
});

it("describes the actual Guardian policy, verification and consent gates", () => {
  const Signup = SignupRoute.options.component!;
  render(<Signup />);
  expect(screen.getByText("This creates your own account. To manage a child learner, verify your email and enable the Learner role. Child profiles require a configured Guardian verification policy, approved Guardian verification and acceptance of the current notice and consent.")).toBeTruthy();
  expect(screen.queryByText(/later update/i)).toBeNull();
});
