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
    await page.getByRole("button", { name: "Send my details to the team", exact: true }).click();
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
    await expect(staff.getByText("Setting up a Tutor profile for")).toBeVisible();

    await staff.getByRole("checkbox", { name: "Physics", exact: true }).check();
    await staff.getByRole("button", { name: "Next", exact: true }).click();
    await staff.getByLabel("Your public name", { exact: true }).fill("Fictional Assisted Tutor");
    await staff.getByLabel("About you, skills and experience", { exact: true }).fill("Patient Physics lessons set up by the team.");
    await staff.getByRole("button", { name: "Next", exact: true }).click();
    await staff.getByLabel("Hourly tuition rate (INR)", { exact: true }).fill("500");
    await staff.getByRole("button", { name: "Next", exact: true }).click();
    await staff.getByRole("checkbox", { name: "I am at least 18 and will provide my own teaching services.", exact: true }).check();
    await staff.getByRole("button", { name: "Next", exact: true }).click();
    await staff.getByRole("button", { name: "Save introduction and continue", exact: true }).click();
    await expect(staff.getByRole("button", { name: "Edit introduction", exact: true })).toBeVisible();

    await staff.getByRole("button", { name: "Create an ad", exact: true }).click();
    const step = async (heading: string) => {
      await staff.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(staff.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    };
    await step("Title of your ad");
    await staff.getByLabel("Ad title", { exact: true }).fill("Patient Physics lessons with clear explanations and guided practice for curious school learners");
    await step("About the class");
    await staff.getByLabel("About the class", { exact: true }).fill("Practical Physics examples.");
    await step("About you");
    await step("Location of the class");
    await staff.getByLabel("Your city", { exact: true }).fill("Kota");
    await step("Languages you teach in");
    await step("Hourly fee");
    await step("Adjust your fees");
    await step("Profile picture");
    const portrait = await sharp({ create: { width: 128, height: 160, channels: 3, background: "#abcdef" } }).png().toBuffer();
    await staff.getByLabel("Portrait image", { exact: true }).setInputFiles({
      name: "tutor.png",
      mimeType: "image/png",
      buffer: Buffer.concat([portrait, Buffer.from("FICTIONAL-TUTOR-EVIDENCE")]),
    });
    await staff.getByRole("checkbox", { name: /This is the Tutor's own adult portrait/ }).check();
    await staff.getByRole("button", { name: "Upload photo", exact: true }).click();
    await expect(staff.getByText(/Portrait uploaded/)).toBeVisible();
    await step("Check your ad before publishing");
    await staff.getByRole("button", { name: "Save as draft", exact: true }).click();
    const publication = staff.getByRole("complementary", { name: "Ad publication", exact: true });
    await publication.getByRole("button", { name: "Publish my ad", exact: true }).click();
    await expect(publication).toContainText("Your ad is online");
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
  } finally {
    if (granted) await operator("revoke", staffEmail);
    await staffContext.close();
  }
});
