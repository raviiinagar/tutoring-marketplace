import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { mobileSupply } from "./mobile-supply";

test("built public journeys meet the adopted mobile lab LCP profile", async ({
  browser,
}, info) => {
  test.setTimeout(300000);
  test.skip(
    process.env.PLAYWRIGHT_BUILT_UI !== "true",
    "Requires npm run build and the isolated built UI stack",
  );
  const reports: unknown[] = [];
  await mobileSupply(
    process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
  );
  for (const path of ["/", "/tutors"]) {
    const samples: number[] = [];
    for (let sample = 0; sample < 5; sample++) {
      const context = await browser.newContext({
        baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: "block",
      });
      try {
        const page = await context.newPage(),
          cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 1600000 / 8,
          uploadThroughput: 750000 / 8,
          connectionType: "cellular4g",
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        // The anonymous visit counter posts with fetch keepalive, which Playwright
        // never reports as finished, so "networkidle" would never settle. Use the
        // product's own Global Privacy Control opt-out to turn the counter off.
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "globalPrivacyControl", {
            value: true,
          });
        });
        await page.addInitScript(() => {
          (window as any).__pilotLcp = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              (window as any).__pilotLcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        });
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // Count only the six fictional offers in their own section. The homepage offer
        // section can be hidden by the owner (lovable-ui/src/lib/site-visibility.ts);
        // this run measures the production build as it ships, so it then checks the
        // Tutor directory, which always loads with the page.
        const homeOffers = page.getByRole("region", { name: "Meet your next teacher" });
        if (path === "/" && (await homeOffers.count()) === 0) {
          await expect(
            page.getByRole("region", { name: "Tutor profiles" }).getByRole("article").first(),
          ).toBeVisible();
        } else {
          const offers = (
            path === "/"
              ? homeOffers
              : page.getByRole("region", { name: "Available teaching offers" })
          ).getByRole("article");
          await expect(offers).toHaveCount(6);
          if (path === "/") {
            const portrait = offers.first().getByRole("img").first();
            expect(
              await portrait.evaluate(
                (img) => (img as HTMLImageElement).currentSrc,
              ),
            ).toContain("variant=card");
            expect(
              await portrait.evaluate(
                (img) => (img as HTMLImageElement).naturalWidth,
              ),
            ).toBeGreaterThan(0);
          }
        }
        // Observe paint stability after first-party requests and hydration have completed.
        await page.waitForFunction(() => performance.now() > 5000);
        const lcp = await page.evaluate(
          () => (window as any).__pilotLcp as number,
        );
        expect(lcp).toBeGreaterThan(0);
        samples.push(lcp);
      } finally {
        await context.close();
      }
    }
    samples.sort((a, b) => a - b);
    const p75 = samples[Math.ceil(samples.length * 0.75) - 1];
    reports.push({ path, samples_ms: samples, p75_ms: p75 });
    await writeFile(
      ".local/pilot-mobile-lcp.json",
      JSON.stringify(reports, null, 2),
    );
    await info.attach("mobile-lcp.json", {
      body: JSON.stringify(
        {
          profile: {
            viewport: "390x844",
            dpr: 1,
            cpu_slowdown: 4,
            latency_ms: 150,
            down_mbps: 1.6,
            up_mbps: 0.75,
            cache: "cold",
            samples: 5,
            method: "CDP observed LCP; local lab, not field p75",
          },
          reports,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(p75, path + " p75 mobile lab LCP").toBeLessThanOrEqual(2500);
  }
});
