import { resolve } from "node:path";

export interface Config {
  mode: "development" | "test" | "production";
  databaseUrl: string;
  authSecret: string;
  webOrigin: string;
  allowedOrigins: string[];
  port: number;
  mailTransport: "capture" | "smtp";
  mailDir: string;
  guardianMode: 'disabled' | 'test';
  smtp?: { host: string; port: number; user: string; password: string; from: string };
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV ?? "development";
  if (!["development", "test", "production"].includes(mode)) throw new Error("Invalid NODE_ENV");
  if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) throw new Error("DATABASE_URL is required");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || /CHANGE_ME/i.test(env.AUTH_SECRET)) throw new Error("AUTH_SECRET must contain at least 32 characters");
  const webOrigin = new URL(env.WEB_ORIGIN || "http://localhost:3000").origin;
  const allowedOrigins = (env.ALLOWED_ORIGINS || webOrigin).split(",").map(value => {
    const url = new URL(value.trim());
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Allowed origins must be exact origins");
    if (mode === "production" && url.protocol !== "https:") throw new Error("Production origins require HTTPS");
    return url.origin;
  });
  // Local browsers commonly use either loopback spelling. Keep production
  // origin authorization exact; aliases apply only to explicit local dev URLs.
  if (mode === "development") {
    for (const value of [...allowedOrigins]) {
      const url = new URL(value);
      if (url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname)) {
        url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
        if (!allowedOrigins.includes(url.origin)) allowedOrigins.push(url.origin);
      }
    }
  }
  if (!allowedOrigins.includes(webOrigin)) throw new Error("WEB_ORIGIN must be allowed");
  const mailTransport = env.MAIL_TRANSPORT || "capture";
  if (mailTransport !== "capture" && mailTransport !== "smtp") throw new Error("Invalid MAIL_TRANSPORT");
  if (mode === "production" && mailTransport !== "smtp") throw new Error("Production requires SMTP; development capture is forbidden");
  const port = Number(env.PORT || 4000);
  const guardianMode=env.GUARDIAN_VERIFICATION_MODE||'disabled';
  if(!['disabled','test'].includes(guardianMode))throw new Error('Unknown guardian verification mode');
  if(mode==='production'&&guardianMode==='test')throw new Error('Test guardian verification is forbidden in production');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  let smtp: Config["smtp"];
  if (mailTransport === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) throw new Error("SMTP host, user, password and from are required");
    const smtpPort = Number(env.SMTP_PORT || 587);
    if (smtpPort !== 465 && smtpPort !== 587) throw new Error("SMTP must use TLS port 465 or STARTTLS port 587");
    smtp = { host: env.SMTP_HOST, port: smtpPort, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.SMTP_FROM };
  }
  return { mode: mode as Config["mode"], databaseUrl: env.DATABASE_URL, authSecret: env.AUTH_SECRET, webOrigin, allowedOrigins, port, mailTransport, mailDir: resolve(env.DEV_MAIL_DIR || ".local/mail"), smtp, guardianMode:guardianMode as Config['guardianMode'] };
}
export const sessionCookieName = (config: Config) => config.mode === "production" ? "__Host-tm_session" : "tm_session";

