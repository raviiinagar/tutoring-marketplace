import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * "Become a Tutor" reminders (ADR0023): both ways to create an ad, as plain text and as a simple
 * branded HTML email (owner's design B). The team option links to the site's team form
 * (/tutor?way=team), never straight to WhatsApp or email, so every request is recorded with the
 * Tutor's consent and appears in the staff onboarding queue. No account data other than the first
 * name goes into the message.
 */
export const TEACH_TEMPLATES = ["TEACH_REMINDER_1", "TEACH_REMINDER_2"] as const;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
/** The team form on /tutor (it records the request and consent before any WhatsApp message). */
export const teamFormUrl = (createUrl: string) => createUrl + "?way=team";

/** The two choices as plain text, replacing [[choices]] in the stored template. */
export function teachChoicesText(createUrl: string) {
  return (
    "1. Send your details to our team. We create the ad for you.\n   " +
    teamFormUrl(createUrl) +
    "\n\n2. Create it yourself in one short form.\n   " +
    createUrl
  );
}

/** Signed, purpose-bound token for the "Stop these reminders" link; it needs no stored state. */
export function teachStopToken(secret: string, userId: string) {
  const mac = createHmac("sha256", secret).update("teach-reminder-stop:" + userId).digest("base64url");
  return Buffer.from(userId).toString("base64url") + "." + mac;
}
export function readTeachStopToken(secret: string, token: string): string | undefined {
  const [id, mac] = token.split(".");
  if (!id || !mac) return undefined;
  const userId = Buffer.from(id, "base64url").toString();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return undefined;
  const expected = Buffer.from(teachStopToken(secret, userId).split(".")[1]!);
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : undefined;
}

const COPY = {
  TEACH_REMINDER_1: {
    lead: "You chose to teach on Tutor Marketplace, but your ad isn't online yet, so learners can't find you.",
    ask: "Two free ways to get your ad online:",
  },
  TEACH_REMINDER_2: {
    lead: "Your teaching ad still isn't online. It takes one short form, or our team can create it for you.",
    ask: "Pick whichever is easier:",
  },
} as const;

export function teachReminderHtml(options: {
  template: (typeof TEACH_TEMPLATES)[number];
  name: string;
  createUrl: string;
  stopUrl: string;
}) {
  const copy = COPY[options.template];
  const btn =
    "display:inline-block;padding:12px 20px;border-radius:999px;font:600 15px Arial,sans-serif;text-decoration:none";
  const first = escapeHtml(options.name.trim().split(/\s+/)[0] || "there");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#fff8e1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;border:1px solid #f0e3c4">
<tr><td style="padding:26px 28px 6px;font:800 22px Arial,sans-serif;color:#1c1714">Tutor <span style="color:#b4283a">Marketplace.</span></td></tr>
<tr><td style="padding:8px 28px 0;font:16px/1.55 Arial,sans-serif;color:#3d3530">
<p style="margin:0 0 12px">Hi ${first},</p>
<p style="margin:0 0 18px">${escapeHtml(copy.lead)}</p>
<p style="margin:0 0 12px;font-weight:700;color:#1c1714">${escapeHtml(copy.ask)}</p></td></tr>
<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff4cf;border-radius:16px"><tr><td style="padding:18px 20px;font:15px/1.5 Arial,sans-serif;color:#3d3530">
<p style="margin:0 0 4px;font-weight:700;color:#1c1714">Send your details to our team</p>
<p style="margin:0 0 14px">Fill in a short form and we create the ad for you. Free.</p>
<a href="${escapeHtml(teamFormUrl(options.createUrl))}" style="${btn};background:#1c1714;color:#ffffff">Send to our team</a>
</td></tr></table></td></tr>
<tr><td style="padding:12px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eadfd3;border-radius:16px"><tr><td style="padding:18px 20px;font:15px/1.5 Arial,sans-serif;color:#3d3530">
<p style="margin:0 0 4px;font-weight:700;color:#1c1714">Create it yourself</p>
<p style="margin:0 0 14px">One short form. Free.</p>
<a href="${escapeHtml(options.createUrl)}" style="${btn};background:#d63447;color:#ffffff">Create my ad</a>
</td></tr></table></td></tr>
<tr><td style="padding:18px 28px 24px;font:14px/1.5 Arial,sans-serif;color:#675e57">
<p style="margin:0 0 14px">Publishing an ad is free. Identity verification is optional.</p>
<p style="margin:0;font-size:12.5px;color:#675e57">You get this because you chose "Teach" on Tutor Marketplace. <a href="${escapeHtml(options.stopUrl)}" style="color:#b4283a">Stop these reminders</a></p>
</td></tr></table></td></tr></table>
</body></html>`;
}
