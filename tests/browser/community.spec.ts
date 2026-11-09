import { openAdminArea } from "./navigation";
import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { totp } from "../../apps/api/src/totp";
const execute = promisify(execFile);
test.use({ actionTimeout: 20_000 });
const password = "Community-browser-password-321!";
async function signup(page: Page, email: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Your name", { exact: true }).fill("Fictional Real Person");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse((r) => r.url().endsWith("/v1/auth/registrations") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await registration).status()).toBe(202);
  await page.getByRole("link", { name: "Open captured email inbox" }).click();
  await page.getByRole("listitem").filter({ hasText: email }).getByRole("link", { name: "Open verification link" }).click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await page.goto("/auth/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/account/);
}
async function join(page: Page, nickname: string) {
  await page.goto("/community");
  await page.getByLabel("Nickname", { exact: true }).fill(nickname);
  await page.getByLabel("I confirm I am aged 18 or older").check();
  await page.getByLabel("I agree to follow the community rules").check();
  await page.getByRole("button", { name: "Join the community", exact: true }).click();
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
}
const operator = (command: "grant" | "revoke", email: string) =>
  execute(
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
      command === "grant" ? "Isolated community browser fixture" : "Isolated community browser fixture cleanup",
      ...(command === "grant" ? ["--scopes", "TRUST"] : []),
    ],
    { timeout: 30_000 },
  );

test("two members chat live, react and report, and a moderator removes the message", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const otherContext = await browser.newContext(),
    other = await otherContext.newPage();
  const staffContext = await browser.newContext(),
    staff = await staffContext.newPage();
  const stamp = Date.now().toString(36);
  const staffEmail = `community-moderator-${stamp}@example.test`;
  let granted = false;
  try {
    await signup(page, `community-a-${stamp}@example.test`);
    await join(page, `Asha ${stamp}`);
    await signup(other, `community-b-${stamp}@example.test`);
    await join(other, `Ravi ${stamp}`);

    const composer = page.getByRole("textbox", { name: "Message General" });
    await composer.fill("Call me on +91 98765 43210");
    await composer.press("Enter");
    await expect(page.getByText(/Keep emails, phone numbers/)).toBeVisible();
    const hello = `Hello from Asha ${stamp}`;
    await composer.fill(hello);
    await composer.press("Enter");
    await expect(page.getByText(hello)).toBeVisible();
    // Delivered to the other browser without a reload.
    const incoming = other.getByRole("listitem", { name: `Message from Asha ${stamp}` }).filter({ hasText: hello });
    await expect(incoming).toBeVisible({ timeout: 10_000 });
    await expect(other.getByText("Fictional Real Person")).toHaveCount(0);

    await incoming.getByRole("button", { name: `Reply to Asha ${stamp}` }).click();
    const reply = `Welcome Asha ${stamp}`;
    await other.getByRole("textbox", { name: "Message General" }).fill(reply);
    await other.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(reply)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Replying to Asha ${stamp}: ${hello}`)).toBeVisible();

    await incoming.getByRole("button", { name: "Add reaction" }).click();
    await other.getByRole("group", { name: "Choose a reaction" }).getByRole("button", { name: "Heart" }).click();
    const mine = page.getByRole("listitem", { name: `Message from Asha ${stamp}` }).filter({ hasText: hello });
    await expect(mine.getByRole("button", { name: "Heart: 1" })).toBeVisible({ timeout: 10_000 });

    await incoming.getByRole("button", { name: "Report message" }).click();
    await other.getByLabel("Report reason").selectOption("SPAM");
    await other.getByRole("button", { name: "Send report" }).click();
    await expect(other.getByText("Thanks. The team will review this message.")).toBeVisible();

    await signup(staff, staffEmail);
    await operator("grant", staffEmail);
    granted = true;
    await staff.goto("/staff");
    await staff.getByLabel("Account password", { exact: true }).fill(password);
    await staff.getByRole("button", { name: "Create authenticator setup", exact: true }).click();
    const secret = await staff.getByLabel("Authenticator setup key", { exact: true }).textContent();
    await staff.getByLabel("Authenticator code", { exact: true }).fill(totp(secret!.trim(), new Date()));
    await staff.getByRole("button", { name: "Confirm MFA", exact: true }).click();
    await staff.getByRole("button", { name: "I saved my recovery codes", exact: true }).click();
    await openAdminArea(staff, "Community");
    await staff.getByLabel("Reason for this moderation session").fill("Daily fictional community moderation");
    await staff.getByRole("button", { name: "Load reported messages" }).click();
    const item = staff.getByRole("listitem", { name: `Reported message from Asha ${stamp}` });
    await expect(item.getByText(hello)).toBeVisible();
    await item.getByRole("button", { name: "Remove message" }).click();
    await expect(staff.getByText("Message removed.")).toBeVisible();

    await expect(other.getByText("This message was removed by the team.")).toBeVisible({ timeout: 10_000 });
    // Neither the message nor the quote in the reply keeps the removed text.
    await expect(other.getByText(hello)).toHaveCount(0);
    await expect(other.getByText(`Replying to Asha ${stamp}: message no longer available`)).toBeVisible();

    await other.setViewportSize({ width: 390, height: 844 });
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await other.screenshot({ path: ".local/task31-community-mobile.png", fullPage: true });
    await page.screenshot({ path: ".local/task31-community-desktop.png", fullPage: true });
    await staff.screenshot({ path: ".local/task31-community-staff.png", fullPage: true });
  } finally {
    if (granted) await operator("revoke", staffEmail);
    await otherContext.close();
    await staffContext.close();
  }
});
