import { test, expect } from "@playwright/test";
test("mobile Access Pass page shows the real server price and keeps unconfigured payments disabled", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
  const email = `payment-browser-${Date.now()}@example.test`;
  const password = "Fictional-browser-payment-321!";
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/v1/auth/registrations", {
        headers,
        data: { display_name: "Fictional payer", email, password },
      })
    ).status(),
  ).toBe(202);
  let verification = "";
  await expect
    .poll(async () => {
      const inbox = await page.request.get("/dev/mail");
      const messages = (await inbox.json()).messages;
      verification =
        messages.find((message: { to: string }) => message.to === email)
          ?.verification_url || "";
      return !!verification;
    })
    .toBe(true);
  expect(
    (
      await page.request.post("/v1/auth/verifications", {
        headers,
        data: { token: new URL(verification).hash.slice(7) },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/v1/auth/sessions", {
        headers,
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/account");
  await page
    .getByRole("link", { name: "Access Pass payment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your Access Pass payment",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Access Pass purchases are not available yet. Browsing Tutors is free.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("₹599.00", { exact: false })).toBeVisible();
  await expect(
    page.getByText("No automatic renewal.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Pay .* securely/ }),
  ).toHaveCount(0);
  expect(
    await page.locator('script[src*="checkout.razorpay.com"]').count(),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/task14-mobile-payments.png",
    fullPage: true,
  });
});
