import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { totp } from "../../apps/api/src/totp";
const execute = promisify(execFile);
test.use({ actionTimeout: 20_000 });
const password = "Privacy-browser-password-321!";
async function signup(page: Page, email: string) {
  await page.goto("/auth/signup");
  await page.getByLabel("Your name").fill("Fictional privacy user");
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
test("verified export and deletion complete with a read-only receipt on mobile", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `privacy-owner-${Date.now()}@example.test`;
  await signup(page, email);
  await page
    .getByRole("link", { name: "Your data and privacy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your data and privacy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Fictional testing policy. Use test accounts and fictional documents only.",
    ),
  ).toBeVisible();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Request data export", exact: true })
    .click();
  await expect(
    page.getByText("Request received. Refresh below to follow its progress."),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        await page
          .getByRole("button", { name: "Refresh request status", exact: true })
          .click();
        return page
          .getByRole("button", { name: "Download export", exact: true })
          .count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await expect(
    page.getByRole("button", { name: "Download export", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download export", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("personal-data.json");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(payload.account.email).toBe(email);
  expect(JSON.stringify(payload)).not.toContain("password_hash");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Delete my account", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("Type DELETE MY ACCOUNT", { exact: true })
    .fill("DELETE MY ACCOUNT");
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText("Read-only request tracking", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        await page
          .getByRole("button", { name: "Refresh request status", exact: true })
          .click();
        return page
          .getByRole("article")
          .filter({
            has: page.getByRole("heading", {
              name: "Account deletion",
              exact: true,
            }),
          })
          .innerText();
      },
      { timeout: 30_000 },
    )
    .toContain("COMPLETED");
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({
    path: ".local/task23-privacy-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText("Read-only request tracking", { exact: true }),
  ).toBeVisible();
  await page.goto("/auth/signin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/signin/);
  await page.goto("/dev/mail");
  await expect(
    page.getByRole("listitem").filter({ hasText: email }),
  ).toHaveCount(0);
});
