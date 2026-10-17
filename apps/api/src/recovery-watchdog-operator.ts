import nodemailer from "nodemailer";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { S3RecoveryStore } from "./recovery-storage.js";
import { inspectIndependentHealth } from "./recovery-watchdog.js";

/** Install on the independent monitor host, never the application VM. */
async function main() {
  const e = process.env;
  if (
    !e.RECOVERY_BUCKET ||
    !e.RECOVERY_REGION ||
    !e.APP_ENVIRONMENT ||
    !e.WATCHDOG_ORIGIN ||
    !e.WATCHDOG_SMTP_HOST ||
    !e.WATCHDOG_SMTP_USER ||
    !e.WATCHDOG_SMTP_PASSWORD ||
    !e.WATCHDOG_SMTP_FROM ||
    !e.WATCHDOG_OWNER_EMAIL ||
    e.WATCHDOG_OWNER_CONTACT_VERIFIED !== "true"
  )
    throw new Error("WATCHDOG_VERIFIED_ROUTING_REQUIRED");
  const port = Number(e.WATCHDOG_SMTP_PORT || 587);
  if (![465, 587].includes(port)) throw new Error("WATCHDOG_SMTP_TLS_REQUIRED");
  const store = new S3RecoveryStore({
    bucket: e.RECOVERY_BUCKET,
    region: e.RECOVERY_REGION,
    environment: e.APP_ENVIRONMENT,
  });
  try {
    const result = await inspectIndependentHealth({
        store,
        origin: e.WATCHDOG_ORIGIN,
      }),
      directory = e.WATCHDOG_STATE_DIR || "/var/lib/tutoring-watchdog";
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let prior: { healthy?: boolean; last_attempt?: number } = {};
    try {
      prior = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const notify =
      (!result.healthy || prior.healthy === false) &&
      (!prior.last_attempt || Date.now() - prior.last_attempt >= 15 * 60000);
    const state = {
      healthy: result.healthy,
      last_attempt: notify ? Date.now() : prior.last_attempt,
    };
    const temporary = join(directory, randomUUID() + ".tmp");
    await writeFile(temporary, JSON.stringify(state), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, join(directory, "state.json"));
    if (notify) {
      const transport = nodemailer.createTransport({
        host: e.WATCHDOG_SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
        auth: { user: e.WATCHDOG_SMTP_USER, pass: e.WATCHDOG_SMTP_PASSWORD },
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });
      try {
        await transport.sendMail({
          from: e.WATCHDOG_SMTP_FROM,
          to: e.WATCHDOG_OWNER_EMAIL,
          subject: result.healthy
            ? "Platform recovery monitoring is healthy"
            : "Critical platform recovery condition",
          text:
            JSON.stringify(result) +
            "\nAutomated monitoring continues outside human support hours. Inspect the private operations console.",
        });
      } finally {
        transport.close();
      }
    }
    console.log(JSON.stringify(result));
    if (!result.healthy) process.exitCode = 2;
  } finally {
    store.destroy();
  }
}
main().catch(() => {
  console.error(
    "Independent watchdog failed; verify monitor storage, TLS, read-only credentials and owner routing.",
  );
  process.exitCode = 1;
});
