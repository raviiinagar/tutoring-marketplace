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
  evidenceScanner: 'disabled'|'test'|'clamav';
  clamav?:{host:string;port:number};
  payments?: {mode:'test'|'live';keyId:string;keySecret:string;webhookSecret:string;disclosures:{merchant:string;invoice_notice:string;base_paise:number;tax_paise:number;test_only:boolean}};
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
  const evidenceScanner=env.EVIDENCE_SCANNER||'disabled';
  if(!['disabled','test','clamav'].includes(evidenceScanner))throw new Error('Unknown evidence scanner');
  if(mode==='production'&&evidenceScanner==='test')throw new Error('Test evidence scanning is forbidden in production');
  let clamav:Config['clamav'];
  if(evidenceScanner==='clamav'){const scanPort=Number(env.CLAMAV_PORT||3310);if(!env.CLAMAV_HOST||!Number.isInteger(scanPort)||scanPort<1||scanPort>65535)throw new Error('ClamAV host and valid port are required');clamav={host:env.CLAMAV_HOST,port:scanPort};}
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  let smtp: Config["smtp"];
  if (mailTransport === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) throw new Error("SMTP host, user, password and from are required");
    const smtpPort = Number(env.SMTP_PORT || 587);
    if (smtpPort !== 465 && smtpPort !== 587) throw new Error("SMTP must use TLS port 465 or STARTTLS port 587");
    smtp = { host: env.SMTP_HOST, port: smtpPort, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.SMTP_FROM };
  }
  const paymentMode=env.PAYMENT_MODE||'disabled';
  if(!['disabled','razorpay_test','razorpay_live'].includes(paymentMode))throw new Error('Invalid PAYMENT_MODE');
  let payments:Config['payments'];
  if(paymentMode!=='disabled'){
    const live=paymentMode==='razorpay_live';
    if(mode==='production'&&!live)throw new Error('Test payments are forbidden in production');
    if(mode!=='production'&&live)throw new Error('Live payments require production isolation');
    const keyId=env.RAZORPAY_KEY_ID||'';const keySecret=env.RAZORPAY_KEY_SECRET||'';const webhookSecret=env.RAZORPAY_WEBHOOK_SECRET||'';
    if(!keyId.startsWith(live?'rzp_live_':'rzp_test_')||keySecret.length<16||webhookSecret.length<16)throw new Error('Matching Razorpay keys and webhook secret are required');
    const base=Number(env.PAYMENT_BASE_PAISE?.trim()||(live?'NaN':'59900'));const tax=Number(env.PAYMENT_TAX_PAISE?.trim()||(live?'NaN':'0'));
    if(!Number.isSafeInteger(base)||!Number.isSafeInteger(tax)||base<0||tax<0||base+tax!==59900)throw new Error('Confirmed payment tax breakdown must total 59900 paise');
    if(live&&(!env.PAYMENT_MERCHANT_NAME?.trim()||!env.PAYMENT_INVOICE_NOTICE?.trim()||env.PAYMENT_LAUNCH_APPROVED!=='true'||env.RAZORPAY_AUTO_CAPTURE_CONFIRMED!=='true'))throw new Error('Live merchant, invoice disclosures, automatic capture and launch approval are required');
    payments={mode:live?'live':'test',keyId,keySecret,webhookSecret,disclosures:{merchant:env.PAYMENT_MERCHANT_NAME?.trim()||'Fictional test merchant',invoice_notice:env.PAYMENT_INVOICE_NOTICE?.trim()||'Test transaction only. No real payment or tax invoice.',base_paise:base,tax_paise:tax,test_only:!live}};
  }
  return { mode: mode as Config["mode"], databaseUrl: env.DATABASE_URL, authSecret: env.AUTH_SECRET, webOrigin, allowedOrigins, port, mailTransport, mailDir: resolve(env.DEV_MAIL_DIR || ".local/mail"), smtp, guardianMode:guardianMode as Config['guardianMode'],evidenceScanner:evidenceScanner as Config['evidenceScanner'],clamav,payments };
}
export const sessionCookieName = (config: Config) => config.mode === "production" ? "__Host-tm_session" : "tm_session";

