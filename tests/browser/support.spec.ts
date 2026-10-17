import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { totp } from "../../apps/api/src/totp";
const execute = promisify(execFile);
test.use({actionTimeout:20_000});
const password = "Support-browser-password-321!";
async function signup(page: Page, email: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Your name").fill("Fictional support user");
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
test("owner and scoped staff exchange a support case while private notes stay staff-only", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const staffContext = await browser.newContext(),
    staff = await staffContext.newPage();
  const email = `support-operator-${Date.now()}@example.test`;
  let granted = false;
  try {
    await signup(page, `support-owner-${Date.now()}@example.test`);
    await page
      .getByRole("link", { name: "Support cases and appeals", exact: true })
      .click();
    await expect(
      page.getByText("Monday-Saturday, 10:00-18:00 IST", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Subject", { exact: true })
      .fill("Help with a lost device session");
    await page
      .getByLabel("Describe the issue", { exact: true })
      .fill("Please explain how to revoke my fictional lost device session.");
    const creation = page.waitForResponse(
      (r) =>
        r.url().endsWith("/v1/me/support-cases") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Create support case", exact: true })
      .click();
    const created = await creation;
    expect(created.status()).toBe(201);
    const id = (await created.json()).case.id;
    await expect(page.getByText("Status: OPEN", { exact: true })).toBeVisible();
    await signup(staff, email);
    await execute(
      process.execPath,
      [
        "--env-file=.local/browser-tests.env",
        "node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "apps/api/tsconfig.json",
        "apps/api/src/staff-operator.ts",
        "grant",
        "--email",
        email,
        "--environment",
        "development",
        "--reason",
        "Isolated support browser fixture",
        "--scopes",
        "SUPPORT",
      ],
      { timeout: 30_000 },
    );
    granted = true;
    await staff.goto("/staff");
    await staff.getByLabel("Account password").fill(password);
    await staff
      .getByRole("button", { name: "Create authenticator setup", exact: true })
      .click();
    const secret = await staff
      .getByLabel("Authenticator setup key")
      .textContent();
    await staff
      .getByLabel("Authenticator code")
      .fill(totp(secret!.trim(), new Date()));
    await staff
      .getByRole("button", { name: "Confirm MFA", exact: true })
      .click();
    await staff
      .getByRole("button", { name: "I saved my recovery codes", exact: true })
      .click();
    await staff
      .getByRole("link", {
        name: "Handle support cases and appeals",
        exact: true,
      })
      .click();
    await staff
      .getByLabel("Reason for case access", { exact: true })
      .fill("Investigate fictional lost session request");
    await staff
      .getByRole("button", { name: "Load case queue", exact: true })
      .click();
    await staff
      .getByRole("button", { name: "Inspect case " + id, exact: true })
      .click();
    await staff
      .getByRole("button", { name: "Claim case", exact: true })
      .click();
    await expect(
      staff.getByText("Status: IN_PROGRESS", { exact: true }),
    ).toBeVisible();
    await staff.getByLabel("Case action", { exact: true }).selectOption("NOTE");
    await staff
      .getByLabel("Private staff note", { exact: true })
      .fill("Private fictional investigation marker for staff only.");
    await staff
      .getByRole("button", { name: "Add private staff note", exact: true })
      .click();
    await expect(
      staff.getByText(
        "Private fictional investigation marker for staff only.",
        { exact: true },
      ),
    ).toBeVisible();
    await staff
      .getByLabel("Case action", { exact: true })
      .selectOption("REPLY");
    await staff
      .getByLabel("Response to customer", { exact: true })
      .fill("Open your account session controls and revoke the lost device.");
    await staff
      .getByRole("button", { name: "Reply and wait for customer", exact: true })
      .click();
    await expect(
      staff.getByText("Status: WAITING_CUSTOMER", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Refresh cases", exact: true })
      .click();
    await expect(
      page.getByText("Status: WAITING_CUSTOMER", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Private fictional investigation marker for staff only.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel("Reply to this case", { exact: true })
      .fill("I revoked the fictional lost session successfully.");
    await page
      .getByRole("button", { name: "Send case reply", exact: true })
      .click();
    await expect(
      page.getByText("Status: IN_PROGRESS", { exact: true }),
    ).toBeVisible();
    await staff
      .getByRole("button", { name: "Inspect case " + id, exact: true })
      .click();
    await expect(
      staff.getByText("I revoked the fictional lost session successfully.", {
        exact: true,
      }),
    ).toBeVisible();
    await staff
      .getByLabel("Case action", { exact: true })
      .selectOption("RESOLVE");
    await staff
      .getByLabel("Response to customer", { exact: true })
      .fill("Your session question is resolved based on your confirmation.");
    await staff
      .getByRole("button", { name: "Resolve support question", exact: true })
      .click();
    await expect(
      staff.getByText("Status: RESOLVED", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Refresh cases", exact: true })
      .click();
    await expect(
      page.getByText("Status: RESOLVED", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Reply to this case", { exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/task22-support-mobile.png",
      fullPage: true,
    });
    await staff.screenshot({
      path: ".local/task22-support-staff.png",
      fullPage: true,
    });
  } finally {
    if (granted)
      await execute(
        process.execPath,
        [
          "--env-file=.local/browser-tests.env",
          "node_modules/tsx/dist/cli.mjs",
          "--tsconfig",
          "apps/api/tsconfig.json",
          "apps/api/src/staff-operator.ts",
          "revoke",
          "--email",
          email,
          "--environment",
          "development",
          "--reason",
          "Isolated support browser fixture cleanup",
        ],
        { timeout: 30_000 },
      );
    await staffContext.close();
  }
});
