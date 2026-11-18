import { openAdminArea } from "./navigation";
import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { totp } from "../../apps/api/src/totp";
const execute = promisify(execFile);
test.use({ actionTimeout: 20_000 });
const password = "Assisted-browser-password-321!";
async function signup(page: Page, email: string, name: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse(
    (r) => r.url().endsWith("/v1/auth/registrations") && r.request().method() === "POST",
  );
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
      command === "grant" ? "Isolated assisted onboarding fixture" : "Isolated assisted onboarding fixture cleanup",
      ...(command === "grant" ? ["--scopes", "SUPPORT"] : []),
    ],
    { timeout: 30_000 },
  );

test("a Tutor sends their details to the team and a Support admin sets up and publishes their ad", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const staffContext = await browser.newContext(),
    staff = await staffContext.newPage();
  const stamp = Date.now().toString(36);
  const tutorEmail = `assisted-tutor-${stamp}@example.test`;
  const staffEmail = `assisted-admin-${stamp}@example.test`;
  let granted = false;
  try {
    // The Tutor chooses the team instead of the wizard, with consent.
    await signup(page, tutorEmail, "Fictional Assisted Tutor");
    await page.goto("/tutor");
    // ADR0021: "Become a Tutor" offers the team first; its form opens straight away.
    await expect(page.getByRole("heading", { name: "Become a Tutor", exact: true })).toBeVisible();
    await page.getByRole("region", { name: "Send to our team", exact: true }).getByRole("button", { name: "Send to our team", exact: true }).click();
    await page.getByLabel("Your WhatsApp number", { exact: true }).fill("+91 90000 00001");
    for (const box of await page.getByRole("group", { name: "Your permission" }).getByRole("checkbox").all()) await box.check();
    await page.getByRole("button", { name: "Send to the team", exact: true }).click();
    const panel = page.getByRole("region", { name: "Our team is setting up your profile" });
    await expect(panel).toContainText("Your request is waiting for a team member.");
    await expect(panel.getByRole("link", { name: /WhatsApp \+91 82335 98649/ })).toHaveAttribute("href", /wa\.me\/918233598649/);
    const reference = (await panel.getByText(/TM-[0-9A-F]{6}/).first().textContent())!.match(/TM-[0-9A-F]{6}/)![0];

    // A Support admin claims the request and uses the Tutor's own wizards for them.
    await signup(staff, staffEmail, "Fictional Support admin");
    await operator("grant", staffEmail);
    granted = true;
    await staff.goto("/staff");
    await staff.getByLabel("Account password", { exact: true }).fill(password);
    await staff.getByRole("button", { name: "Create authenticator setup", exact: true }).click();
    const secret = await staff.getByLabel("Authenticator setup key", { exact: true }).textContent();
    await staff.getByLabel("Authenticator code", { exact: true }).fill(totp(secret!.trim(), new Date()));
    await staff.getByRole("button", { name: "Confirm MFA", exact: true }).click();
    await staff.getByRole("button", { name: "I saved my recovery codes", exact: true }).click();
    await openAdminArea(staff, "Tutor onboarding");
    await staff.getByRole("button", { name: "Load requests", exact: true }).click();
    const card = staff.getByRole("listitem").filter({ hasText: tutorEmail });
    await expect(card).toContainText(reference);
    await expect(card.getByRole("link", { name: "+919000000001" })).toHaveAttribute("href", "https://wa.me/919000000001");
    await card.getByRole("button", { name: "Claim", exact: true }).click();
    await expect(staff.getByText("Creating the first ad for")).toBeVisible();
    // ADR0021: the request cannot be completed before the Tutor's ad is online.
    await expect(staff.getByRole("button", { name: "Mark as complete", exact: true })).toBeDisabled();

    // The same one form the Tutor sees under "Create it myself", filled in for them.
    await staff.getByRole("combobox", { name: "Subject", exact: true }).selectOption("subject-physics");
    await staff.getByRole("combobox", { name: "Teaching category", exact: true }).selectOption("school");
    await staff.getByRole("combobox", { name: "Students you teach", exact: true }).selectOption("level-class-10");
    await staff.getByRole("combobox", { name: "School board", exact: true }).selectOption("curriculum-cbse");
    await staff.getByRole("combobox", { name: "Teaching language", exact: true }).selectOption("language-english");
    await expect(staff.getByLabel("Your public name", { exact: true })).toHaveValue("Fictional Assisted Tutor");
    await staff.getByLabel("About you and your classes", { exact: true }).fill("Patient Physics lessons set up by the team.");
    await staff.getByLabel("Hourly rate (INR)", { exact: true }).fill("500");
    await staff.getByRole("checkbox", { name: "I am at least 18 and will provide my own teaching services.", exact: true }).check();
    const portrait = await sharp({ create: { width: 128, height: 160, channels: 3, background: "#abcdef" } }).png().toBuffer();
    await staff.getByLabel("Profile photo", { exact: true }).setInputFiles({
      name: "tutor.png",
      mimeType: "image/png",
      buffer: Buffer.concat([portrait, Buffer.from("FICTIONAL-TUTOR-EVIDENCE")]),
    });
    await staff.getByRole("checkbox", { name: /This is my own adult portrait/ }).check();
    await staff.getByRole("button", { name: "Preview my ad", exact: true }).click();
    await expect(staff.getByRole("heading", { name: "Preview your ad", exact: true })).toBeVisible();
    await staff.getByRole("button", { name: "Publish for free", exact: true }).click();
    await expect(staff.getByText("The Tutor's ad is online. You can mark the request complete.")).toBeVisible();
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await info.attach("assisted-workspace", { body: await staff.screenshot({ fullPage: true }), contentType: "image/png" });

    // The Tutor's own account shows the published ad; nothing was verified on their behalf.
    const own = await (await page.request.get("/v1/me/listings")).json();
    expect(own.listings[0].status).toBe("PUBLISHED");
    expect((await page.request.get("/v1/listings/" + own.listings[0].id)).status()).toBe(200);
    expect((await (await page.request.get("/v1/me/tutor")).json()).profile.identity_verified).toBe(false);

    await staff.getByRole("button", { name: "Mark as complete", exact: true }).click();
    await expect(staff.getByText("Fictional Assisted Tutor's request is complete.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Our team finished setting up your profile.", { exact: false })).toBeVisible();

    // A completed request can be reopened to change the ad, then completed again.
    await staff.getByRole("button", { name: "Completed", exact: true }).click();
    const completed = staff.getByRole("listitem").filter({ hasText: tutorEmail });
    await completed.getByRole("button", { name: "Reopen", exact: true }).click();
    await expect(staff.getByText("The Tutor's ad is online. You can mark the request complete.")).toBeVisible();
    await staff.getByRole("button", { name: "Mark as complete", exact: true }).click();
    await expect(staff.getByText("Fictional Assisted Tutor's request is complete.")).toBeVisible();
  } finally {
    if (granted) await operator("revoke", staffEmail);
    await staffContext.close();
  }
});
