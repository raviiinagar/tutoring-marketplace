import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthShell, Field } from "@/components/account/ui";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("masks passwords by default and toggles each field without losing typed input or submitting", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  );
  const submit = vi.fn();
  function Form() {
    const [value, setValue] = useState("");
    return (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthShell title="Password check">
          <form onSubmit={submit}>
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Field label="New password" type="password" defaultValue="Fictional8" />
            <Field label="Email" type="email" />
          </form>
        </AuthShell>
      </QueryClientProvider>
    );
  }
  render(<Form />);
  const field = screen.getByLabelText("Password", { exact: true });
  const show = screen.getByRole("button", { name: "Show password" });
  await waitFor(() => expect(show).not.toBeDisabled());
  expect(field).toHaveAttribute("type", "password");
  fireEvent.change(field, { target: { value: "Eight123" } });
  fireEvent.click(show);
  expect(field).toHaveAttribute("type", "text");
  expect(field).toHaveValue("Eight123");
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByLabelText("New password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(field).toHaveAttribute("type", "password");
  expect(field).toHaveValue("Eight123");
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Show email/ })).toBeNull();
});
