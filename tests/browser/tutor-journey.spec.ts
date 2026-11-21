import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { chooseRoles } from "./navigation";
import { fixtureBiography, fixtureDescription, fixtureTitle } from "../../apps/api/test/helpers/publication";

// ADR0021: sign up, land in My Account, add a photo, choose Teach, then pick how to create the ad.
test.use({ actionTimeout: 20_000 });
const password = "Journey-browser-password-321!";
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
}
const portrait = async (background: string) =>
  Buffer.concat([
    await sharp({ create: { width: 128, height: 160, channels: 3, background } }).png().toBuffer(),
    Buffer.from("FICTIONAL-TUTOR-EVIDENCE"),
  ]);

for (const width of [1280, 390]) {
  test(`a new account chooses Teach in My Account and then how to create its ad at ${width}px`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: 844 });
    const stamp = Date.now().toString(36);
    await signup(page, `journey-${width}-${stamp}@example.test`, "Fictional Journey Member");

    // My Account opens first and asks once how the account will be used.
    await expect(page).toHaveURL(/\/account\/settings/);
    const roles = page.locator("#roles");
    await expect(page.getByRole("heading", { name: "How will you use Tutor Marketplace?", exact: true })).toBeVisible();
    for (const name of [/^Learn/, /^Teach/]) await expect(roles.getByRole("radio", { name })).not.toBeChecked();
    await expect(roles.getByRole("radio", { name: /^Both/ })).toHaveCount(0);

    // The photo is managed right here, without a Tutor profile and without staff review.
    await page.getByRole("checkbox", { name: /This is a clear photo of me/ }).check();
    const uploaded = page.waitForResponse((r) => new URL(r.url()).pathname === "/v1/me/tutor/photo" && r.request().method() === "POST");
    await page.getByLabel("Profile photo file", { exact: true }).setInputFiles({ name: "fictional-portrait.png", mimeType: "image/png", buffer: await portrait("#99bbdd") });
    expect((await uploaded).status()).toBe(201);
    await expect(page.getByText("Photo updated.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove photo", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.local/tutor-journey-account-${width}.png`, fullPage: true });

    await chooseRoles(page, "Teach");
    expect((await (await page.request.get("/v1/me")).json()).user).toMatchObject({ roles: ["TUTOR"], roles_chosen: true });
    await page.getByRole("link", { name: "Go to your teaching", exact: true }).click();

    // A new Tutor chooses between our team (highlighted) and the one-form setup.
    await expect(page.getByRole("heading", { name: "Become a Tutor", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Send to our team", exact: true })).toContainText("Recommended");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.local/tutor-journey-chooser-${width}.png`, fullPage: true });
    await page.getByRole("region", { name: "Send to our team", exact: true }).getByRole("button", { name: "Send to our team", exact: true }).click();
    await expect(page.getByLabel("Your WhatsApp number", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create it myself instead", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create your teaching ad", exact: true })).toBeVisible();
    // Looking at the choices creates nothing.
    expect((await (await page.request.get("/v1/me/tutor")).json()).profile).toBeNull();
    expect((await (await page.request.get("/v1/me/listings")).json()).listings).toEqual([]);
  });
}

test("a signed-in visitor reports a published Tutor's photo once", async ({ page, browser, baseURL }) => {
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  await signup(page, `journey-tutor-${stamp}@example.test`, "Fictional Reported Tutor");
  await chooseRoles(page, "Teach");
  const headers = { Origin: baseURL! };
  // History, so this ad does not change the Physics counts other specs check on the shared stack.
  const intro = await page.request.post("/v1/me/tutor/introduction", {
    headers,
    data: { display_name: "Fictional Reported Tutor", biography: fixtureBiography, subject_ids: ["subject-history"], hourly_rate_paise: 50000, identity_country: "IN", identity_document: "AADHAAR", adult_confirmed: true, public_email_consent: false },
  });
  expect(intro.status()).toBe(200);
  const profileId = (await intro.json()).profile.public_id as string;
  const photo = await page.request.post("/v1/me/tutor/photo", { headers, data: { media_type: "image/png", data: (await portrait("#aa8866")).toString("base64"), public_consent: true } });
  expect(photo.status()).toBe(201);
  const draft = (await (await page.request.post("/v1/me/listings", { headers, data: { title: fixtureTitle.replace("Physics", "History"), description: fixtureDescription, domain_id: "school", subject_id: "subject-history", level_id: "level-class-10", curriculum_id: "curriculum-cbse", language_ids: ["language-english"], currency: "INR", teaching_mode: "ONLINE", rate_paise: 50000, rate_unit: "HOUR", trial_kind: "NONE" } })).json()).listing;
  const published = await page.request.post(`/v1/me/listings/${draft.id}/actions/PUBLISH`, { headers, data: { revision: draft.revision } });
  expect(published.status()).toBe(200);
  const revision = (await published.json()).listing.revision as number;

  const visitorContext = await browser.newContext({ baseURL });
  const visitor = await visitorContext.newPage();
  try {
    // Signed out, the report asks the visitor to sign in.
    await visitor.goto(`/profiles/${profileId}`);
    await visitor.getByRole("button", { name: "Report photo", exact: true }).click();
    await visitor.getByRole("radio", { name: "It is not this Tutor", exact: true }).check();
    await visitor.getByRole("button", { name: "Send report", exact: true }).click();
    await expect(visitor.getByRole("link", { name: "sign in", exact: true })).toBeVisible();

    await signup(visitor, `journey-visitor-${stamp}@example.test`, "Fictional Visitor");
    await chooseRoles(visitor, "Learn");
    await visitor.goto(`/profiles/${profileId}`);
    await visitor.getByRole("button", { name: "Report photo", exact: true }).click();
    await visitor.getByRole("radio", { name: "It is not a photo of a person", exact: true }).check();
    const reported = visitor.waitForResponse((r) => r.url().endsWith("/photo-reports") && r.request().method() === "POST");
    await visitor.getByRole("button", { name: "Send report", exact: true }).click();
    expect((await reported).status()).toBe(200);
    await expect(visitor.getByText("Thank you. Our team will review this photo.", { exact: true })).toBeVisible();
  } finally {
    await visitorContext.close();
    // Take the ad offline so it does not change what other specs see on the shared stack.
    expect((await page.request.post(`/v1/me/listings/${draft.id}/actions/PAUSE`, { headers, data: { revision } })).status()).toBe(200);
  }
});
