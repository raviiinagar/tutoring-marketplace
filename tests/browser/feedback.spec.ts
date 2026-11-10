import { openAccountHelp, openAdminArea } from "./navigation";
import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { totp } from "../../apps/api/src/totp";
const execute = promisify(execFile);
test.use({ actionTimeout: 20_000 });
const password = "Feedback-browser-password-321!";
async function signup(page: Page, email: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Your name", { exact: true }).fill("Fictional beta member");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse(
    (r) => r.url().endsWith("/v1/auth/registrations") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await registration).status()).toBe(202);
  await page.getByRole("link", { name: "Open captured email inbox" }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: email })
    .getByRole("link", { name: "Open verification link" })
    .click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await page.goto("/auth/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/account/);
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
      command === "grant" ? "Isolated feedback browser fixture" : "Isolated feedback browser fixture cleanup",
      ...(command === "grant" ? ["--scopes", "SUPPORT"] : []),
    ],
    { timeout: 30_000 },
  );

test("a member reports a bug and votes on a suggestion while staff triage it with staff-only notes", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const staffContext = await browser.newContext(),
    staff = await staffContext.newPage();
  const stamp = Date.now().toString(36);
  const staffEmail = `feedback-operator-${stamp}@example.test`;
  const bugTitle = `Search button unresponsive ${stamp}`;
  const ideaTitle = `Saved searches with alerts ${stamp}`;
  let granted = false;
  try {
    await signup(page, `feedback-member-${stamp}@example.test`);
    await openAccountHelp(page);
    await page.getByRole("link", { name: "Beta feedback and suggestions", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tell us what you found" })).toBeVisible();

    await page.getByLabel("Bug", { exact: true }).check();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(bugTitle);
    await page.getByRole("textbox", { name: /^Details/ }).fill("Tapping search on the tutors page does nothing on my phone.");
    await page.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(page.getByText(/Your report was sent to our team/)).toBeVisible();

    await page.getByLabel("Suggestion", { exact: true }).check();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Call me");
    await page.getByRole("textbox", { name: /^Details/ }).fill("Reach me on +91 98765 43210 to talk about it.");
    await page.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(page.getByText(/Keep emails, phone numbers/)).toBeVisible();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(ideaTitle);
    await page.getByRole("textbox", { name: /^Details/ }).fill("Let me save a search and get told when new Tutors match it.");
    await page.getByRole("button", { name: "Send feedback", exact: true }).click();
    await expect(page.getByText(/Your idea is now on the suggestion board/)).toBeVisible();

    await page.getByRole("tab", { name: "Suggestion board" }).click();
    const upvote = page.getByRole("button", { name: `Upvote ${ideaTitle}`, exact: true });
    await upvote.click();
    const voted = page.getByRole("button", { name: `Remove your vote for ${ideaTitle}`, exact: true });
    await expect(voted).toHaveAttribute("aria-pressed", "true");
    await expect(voted).toHaveText("1");

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
    await openAdminArea(staff, "Beta feedback");
    await staff.getByLabel("Reason for opening feedback", { exact: true }).fill("Weekly fictional beta feedback triage");
    await staff.getByLabel("Category", { exact: true }).selectOption("BUG");
    await staff.getByRole("button", { name: "Load feedback", exact: true }).click();
    await staff.getByRole("button", { name: `Inspect feedback ${bugTitle}`, exact: true }).click();
    await expect(staff.getByText("Tapping search on the tutors page does nothing on my phone.")).toBeVisible();
    await staff.getByLabel("Action", { exact: true }).selectOption("NOTE");
    await staff.getByLabel("Staff-only note", { exact: true }).fill("Staff-only marker: reproduced on a fictional phone.");
    await staff.getByRole("button", { name: "Save action", exact: true }).click();
    await expect(staff.getByText("Staff-only marker: reproduced on a fictional phone.")).toBeVisible();
    await staff.getByLabel("Action", { exact: true }).selectOption("SET_STATUS");
    await staff.getByLabel("New status", { exact: true }).selectOption("IN_PROGRESS");
    await staff.getByLabel("Message to the member (optional)", { exact: true }).fill("Thanks, we are fixing the search button.");
    await staff.getByRole("button", { name: "Save action", exact: true }).click();
    await expect(staff.getByText("Status changed: In progress")).toBeVisible();

    await page.getByRole("tab", { name: /^My feedback/ }).click();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByRole("button", { name: `Open feedback ${bugTitle}`, exact: true }).click();
    const details = page.getByRole("article", { name: "Feedback details" });
    await expect(details.getByText("Thanks, we are fixing the search button.")).toBeVisible();
    await expect(details.getByText("In progress").first()).toBeVisible();
    await expect(page.getByText("Staff-only marker: reproduced on a fictional phone.")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: ".local/task30-feedback-mobile.png", fullPage: true });
    await staff.screenshot({ path: ".local/task30-feedback-staff.png", fullPage: true });
  } finally {
    if (granted) await operator("revoke", staffEmail);
    await staffContext.close();
  }
});
