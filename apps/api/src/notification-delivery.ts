import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { z } from "zod";
import type { Config } from "./config.js";
export type NotificationEmail = {
  id: string;
  to: string;
  subject: string;
  text: string;
  url: string;
};
export type CriticalSms = { id: string; reference: string; url: string };
export interface NotificationDelivery {
  readonly testOnly: boolean;
  readonly smsConfigured: boolean;
  sendEmail(message: NotificationEmail): Promise<{ reference: string }>;
  sendCriticalSms(message: CriticalSms): Promise<{ reference: string }>;
  reconcileCriticalSms?(
    reference: string,
    message: CriticalSms,
  ): Promise<{ reference: string; status: "ACCEPTED" | "FAILED" }>;
}
export class DeliveryConfigurationError extends Error {}
export class DeliveryUnknownError extends Error {}
export class ConfiguredNotificationDelivery implements NotificationDelivery {
  readonly testOnly: boolean;
  readonly smsConfigured: boolean;
  constructor(
    private readonly config: Config,
    private readonly transport: typeof fetch = fetch,
  ) {
    this.testOnly = config.mailTransport === "capture";
    this.smsConfigured = !!config.sms;
  }
  async sendEmail(message: NotificationEmail) {
    if (this.config.mailTransport === "capture") {
      if (this.config.mode === "production")
        throw new DeliveryConfigurationError(
          "Capture is forbidden in production",
        );
      await mkdir(this.config.mailDir, { recursive: true });
      await writeFile(
        join(this.config.mailDir, message.id + ".json"),
        JSON.stringify(
          {
            id: message.id,
            to: message.to,
            subject: message.subject,
            text: message.text,
            notification_url: message.url,
            development_only: true,
            captured_at: new Date().toISOString(),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      return { reference: "local-" + message.id };
    }
    const settings = this.config.smtp;
    if (!settings)
      throw new DeliveryConfigurationError("SMTP is not configured");
    const client = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      requireTLS: true,
      auth: { user: settings.user, pass: settings.password },
      tls: { minVersion: "TLSv1.2" },
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
    try {
      await client.sendMail({
        from: settings.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        messageId:
          "<" +
          message.id +
          "@" +
          new URL(this.config.webOrigin).hostname +
          ">",
      });
      return { reference: message.id };
    } finally {
      client.close();
    }
  }
  private async smsRequest(path: string, body?: URLSearchParams) {
    const sms = this.config.sms;
    if (!sms)
      throw new DeliveryConfigurationError("Critical SMS is not configured");
    let response: Response;
    try {
      response = await this.transport(
        "https://api.twilio.com/2010-04-01/Accounts/" +
          sms.accountSid +
          "/" +
          path,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(sms.accountSid + ":" + sms.authToken).toString(
                "base64",
              ),
            ...(body
              ? { "Content-Type": "application/x-www-form-urlencoded" }
              : {}),
          },
          ...(body ? { body: body.toString() } : {}),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new DeliveryUnknownError("SMS provider result unknown");
    }
    if (response.status >= 500)
      throw new DeliveryUnknownError("SMS provider result unknown");
    if (!response.ok) throw new Error("SMS provider rejected the request");
    try {
      return await response.json();
    } catch {
      throw new DeliveryUnknownError("SMS provider result unknown");
    }
  }
  async sendCriticalSms(message: CriticalSms) {
    const sms = this.config.sms;
    if (!sms)
      throw new DeliveryConfigurationError("Critical SMS is not configured");
    const result = z
      .object({
        sid: z.string().regex(/^SM[0-9a-fA-F]{32}$/),
        account_sid: z.string(),
        to: z.string(),
        status: z.string(),
      })
      .safeParse(
        await this.smsRequest(
          "Messages.json",
          new URLSearchParams({
            To: sms.ownerPhone,
            MessagingServiceSid: sms.messagingSid,
            ContentSid: sms.contentSid,
            ContentVariables: JSON.stringify({
              "1": message.reference,
              "2": message.url,
              "3": message.id,
            }),
          }),
        ),
      );
    if (!result.success)
      throw new DeliveryUnknownError("SMS provider result unknown");
    const data = result.data;
    if (data.account_sid !== sms.accountSid || data.to !== sms.ownerPhone)
      throw new DeliveryUnknownError("SMS identity requires review");
    if (["failed", "undelivered", "canceled"].includes(data.status))
      throw new Error("SMS provider rejected the message");
    return { reference: data.sid };
  }
  async reconcileCriticalSms(reference: string, message: CriticalSms) {
    const sms = this.config.sms;
    if (!sms)
      throw new DeliveryConfigurationError("Critical SMS is not configured");
    const result = z
      .object({
        sid: z.string(),
        account_sid: z.string(),
        to: z.string(),
        body: z.string(),
        status: z.string(),
      })
      .parse(
        await this.smsRequest(
          "Messages/" + encodeURIComponent(reference) + ".json",
        ),
      );
    if (
      result.sid !== reference ||
      result.account_sid !== sms.accountSid ||
      result.to !== sms.ownerPhone ||
      !result.body.includes(message.reference) ||
      !result.body.includes(message.id)
    )
      throw new DeliveryUnknownError("SMS identity requires review");
    return {
      reference: result.sid,
      status: ["failed", "undelivered", "canceled"].includes(result.status)
        ? ("FAILED" as const)
        : ("ACCEPTED" as const),
    };
  }
}
