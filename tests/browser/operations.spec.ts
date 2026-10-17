import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { totp } from "../../apps/api/src/totp";
const execute = promisify(execFile);
test.use({ actionTimeout: 20_000 });
const password = "Operations-browser-password-321!";
async function signup(page: Page, email: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Your name").fill("Fictional operations owner");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse(
    (r) =>
      r.url().endsWith("/v1/auth/registrations") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  expect((await registration).status()).toBe(202);
  await page.getByRole("link", { name: "Open captured email inbox" }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: email })
    .getByRole("link", { name: "Open verification link" })
    .click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email verified", exact: true }),
  ).toBeVisible();
  await page.goto("/auth/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/account/);
}
async function operator(command: "grant" | "revoke", email: string) {
  await execute(
    process.execPath,
    [
      "--env-file=.local/browser-tests.env",
      "node_modules/tsx/dist/cli.mjs",
      "--tsconfig",
      "apps/api/tsconfig.json",
      "apps/api/src/staff-operator.ts",
      command,
      "--email",
      email,
      "--environment",
      "development",
      "--reason",
      "Isolated operations browser fixture",
      ...(command === "grant" ? ["--scopes", "SUPPORT,FINANCE"] : []),
    ],
    { timeout: 30000 },
  );
}
test("operations console records scoped health, pauses checkout and keeps mobile recovery controls private", async ({
  page,
}) => {
  test.setTimeout(240000);
  const email = `operations-${Date.now()}@example.test`;
  let granted = false;
  try {
    await signup(page, email);
    await operator("grant", email);
    granted = true;
    await page.goto("/staff");
    await page.getByLabel("Account password").fill(password);
    await page
      .getByRole("button", { name: "Create authenticator setup", exact: true })
      .click();
    const secret = (await page
      .getByLabel("Authenticator setup key")
      .textContent())!.trim();
    await page.getByLabel("Authenticator code").fill(totp(secret, new Date()));
    await page
      .getByRole("button", { name: "Confirm MFA", exact: true })
      .click();
    await page
      .getByRole("button", { name: "I saved my recovery codes", exact: true })
      .click();
    await page
      .getByRole("link", {
        name: "Monitor operations and recover failed work",
        exact: true,
      })
      .click();
    const reason = page.getByLabel("Reason for operations access");
    await reason.fill("Inspect fictional billing health before recovery");
    const inspect = page.getByRole("button", {
      name: "Inspect operations",
      exact: true,
    });
    await inspect.click();
    await expect(
      page.getByText(/Owner email routing needs configuration/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pause new checkout", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resume new checkout", exact: true }),
    ).toBeVisible();
    const shell = await page.request.get("/staff/operations");
    expect(shell.headers()["x-robots-tag"]).toContain("noindex");
    expect(shell.headers()["cache-control"]).toContain("no-store");
    await page.getByLabel("Evidence type").selectOption("WEBHOOK_DELIVERY");
    await page
      .getByLabel("Evidence reference")
      .fill("FICTIONAL-WEBHOOK-DISABLED");
    await page
      .getByRole("button", { name: "Record verified observation", exact: true })
      .click();
    await expect(page.getByText(/Command recorded/)).toBeVisible();
    await expect
      .poll(
        async () => {
          const r = await page.request.get(
            "/v1/staff/operations?scope=FINANCE&reason=Inspect%20fictional%20webhook%20monitor",
          );
          return (await r.json()).alerts.some(
            (a: { code: string; status: string }) =>
              a.code === "WEBHOOK_UNHEALTHY" && a.status === "OPEN",
          );
        },
        { timeout: 45000 },
      )
      .toBe(true);
    await inspect.click();
    await expect(
      page.getByRole("heading", {
        name: "Webhook delivery is unverified or unhealthy",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/task25-operations-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/task25-operations-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Resume new checkout", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause new checkout", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Operations area").selectOption("SUPPORT");
    await inspect.click();
    await expect(
      page.getByRole("heading", { name: "Checkout control", exact: true }),
    ).toHaveCount(0);
    await operator("revoke", email);
    granted = false;
    await page.reload();
    await expect(
      page.getByText(/This staff area is not available to your account/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Inspect operations", exact: true }),
    ).toBeDisabled();
  } finally {
    if (granted) await operator("revoke", email);
  }
});
