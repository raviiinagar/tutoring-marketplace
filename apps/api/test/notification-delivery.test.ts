import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfiguredNotificationDelivery,
  DeliveryUnknownError,
} from "../src/notification-delivery.js";
import { loadConfig } from "../src/config.js";

const config = {
  ...loadConfig({
    DATABASE_URL: "postgres://unused/unused",
    AUTH_SECRET: "a".repeat(48),
    NODE_ENV: "test",
  }),
  sms: {
    accountSid: "AC" + "1".repeat(32),
    authToken: "x".repeat(32),
    messagingSid: "MG" + "2".repeat(32),
    contentSid: "HX" + "3".repeat(32),
    ownerPhone: "+919876543210",
    dailyLimit: 5,
  },
};
const message = {
  id: "11111111-1111-4111-8111-111111111111",
  reference: "22222222-2222-4222-8222-222222222222",
  url: "https://example.test/staff/notifications",
};
test("critical SMS treats an invalid success or server outage as uncertain, and provider proof binds the unique alert", async () => {
  for (const response of [
    Response.json({ unexpected: true }),
    new Response("Unavailable", { status: 503 }),
  ]) {
    const delivery = new ConfiguredNotificationDelivery(
      config,
      async () => response,
    );
    await assert.rejects(
      delivery.sendCriticalSms(message),
      DeliveryUnknownError,
    );
  }
  let posted: URLSearchParams | undefined;
  const sid = "SM" + "4".repeat(32);
  const delivery = new ConfiguredNotificationDelivery(
    config,
    async (_url, init) => {
      if (init?.method === "POST") {
        posted = new URLSearchParams(String(init.body));
        return Response.json({
          sid,
          account_sid: config.sms.accountSid,
          to: config.sms.ownerPhone,
          status: "queued",
        });
      }
      return Response.json({
        sid,
        account_sid: config.sms.accountSid,
        to: config.sms.ownerPhone,
        status: "sent",
        body: "Alert " + message.reference,
      });
    },
  );
  assert.equal((await delivery.sendCriticalSms(message)).reference, sid);
  assert.equal(JSON.parse(posted!.get("ContentVariables")!)["3"], message.id);
  await assert.rejects(
    delivery.reconcileCriticalSms(sid, message),
    DeliveryUnknownError,
  );
});
