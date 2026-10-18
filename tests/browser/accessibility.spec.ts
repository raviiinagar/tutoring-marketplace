import { test, expect } from "@playwright/test";
import { auditAccessibility } from "./accessibility";
test.use({ reducedMotion: "reduce" });

test("keyboard users skip navigation and recover focus after mobile menu and route changes", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", {
    name: "Skip to main content",
    exact: true,
  });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  await expect(menu).toBeEnabled();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toHaveCount(0);
  await menu.click();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Find Tutors", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find online Tutors", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
  await auditAccessibility(page, info, "mobile-discovery");
});

test("discovery and authentication expose labelled forms, contrast and announced errors", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/tutors", "/auth/signin", "/auth/signup"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await auditAccessibility(page, info, width + path.replaceAll("/", "-"));
    }
  }
  await page.goto("/auth/signin");
  await page
    .getByLabel("Email", { exact: true })
    .fill("no-account@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Fictional-wrong-password-321!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await auditAccessibility(page, info, "signin-error");
});

test("signed-in mobile and desktop checkout, Tutor, support and privacy forms are accessible", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
  const email = `accessibility-${Date.now()}@example.test`,
    password = "Fictional-accessibility-password-321!";
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post("/v1/auth/registrations", {
        headers,
        data: { display_name: "Fictional accessibility user", email, password },
      })
    ).status(),
  ).toBe(202);
  let link = "";
  await expect
    .poll(async () => {
      const inbox = await (await page.request.get("/dev/mail")).json();
      link =
        inbox.messages.find((m: { to: string }) => m.to === email)
          ?.verification_url || "";
      return !!link;
    })
    .toBe(true);
  expect(
    (
      await page.request.post("/v1/auth/verifications", {
        headers,
        data: { token: new URL(link).hash.slice(7) },
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
  expect(
    (
      await page.request.post("/v1/me/roles", {
        headers,
        data: { roles: ["LEARNER", "TUTOR"] },
      })
    ).status(),
  ).toBe(200);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [path, label] of [
      ["/payments", "Your Access Pass payment"],
      ["/tutor", "Tutor onboarding"],
      ["/tutor/listings", "Your teaching offers"],
      ["/support", "Support and appeals"],
      ["/privacy", "Your data and privacy"],
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: label, exact: true }),
      ).toBeVisible();
      // Wait for the authoritative response, rather than auditing a temporary loading shell.
      if (path === "/tutor")
        await expect(page.getByLabel("Tutor display name")).toBeEnabled();
      if (path === "/privacy")
        await expect(
          page.getByLabel("Current password", { exact: true }),
        ).toBeVisible();
      if (path === "/support")
        await expect(
          page.getByLabel("Category", { exact: true }),
        ).toBeVisible();
      if (path === "/payments")
        await expect(page.getByText("₹599.00", { exact: false })).toBeVisible();
      if (path === "/tutor/listings")
        await expect(
          page.getByLabel("Offer title", { exact: true }),
        ).toBeVisible();
      await auditAccessibility(page, info, width + path.replaceAll("/", "-"));
    }
  }
});

test("form boundaries and keyboard focus stay visible against the input surface", async ({
  page,
}) => {
  await page.goto("/auth/signin");
  const email = page.getByLabel("Email", { exact: true });
  await expect(email).toBeEnabled();
  const ratio = async (property: "borderTopColor" | "outlineColor") =>
    email.evaluate((input, property) => {
      const style = getComputedStyle(input);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { colorSpace: "srgb" })!;
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const a = luminance(style[property]),
        b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, property);
  expect(
    await ratio("borderTopColor"),
    "non-text input boundary contrast",
  ).toBeGreaterThanOrEqual(3);
  for (
    let n = 0;
    n < 20 && !(await email.evaluate((el) => el === document.activeElement));
    n++
  )
    await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  expect(
    await email.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth)),
  ).toBeGreaterThanOrEqual(2);
  expect(
    await ratio("outlineColor"),
    "keyboard focus contrast",
  ).toBeGreaterThanOrEqual(3);
});

test("client-side form errors announce themselves and describe each invalid input", async ({
  page,
}) => {
  await page.goto("/auth/signin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("alert")).toHaveCount(2);
  for (const name of ["Email", "Password"]) {
    const input = page.getByLabel(name, { exact: true });
    const errorId = await input.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    await expect(page.locator(`[id="${errorId}"]`)).toHaveAttribute(
      "role",
      "alert",
    );
  }
});
