import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { Database } from "../../apps/api/src/database.js";
import { type Config, sessionCookieName } from "../../apps/api/src/config.js";
import {
  hashPassword,
  randomToken,
  tokenHash,
  encrypt,
} from "../../apps/api/src/security.js";
import { assignStaff, staffCookieName } from "../../apps/api/src/staff.js";
import { totp } from "../../apps/api/src/totp.js";
import { grantContactFixture } from "../../scripts/contact-request-fixture.js";
import type {
  ProviderOrder,
  ProviderPayment,
} from "../../apps/api/src/payment-provider.js";

export class PilotProvider {
  orders = new Map<string, ProviderOrder>();
  payments = new Map<string, ProviderPayment>();
  async createOrder(cycle: string, amount: number, currency: string) {
    const order = {
      id: "order_" + randomBytes(8).toString("hex"),
      entity: "order" as const,
      amount,
      currency,
      receipt: cycle,
      notes: { cycle_id: cycle },
      status: "created",
    };
    this.orders.set(order.id, order);
    return order;
  }
  async fetchOrder(id: string) {
    return this.orders.get(id)!;
  }
  async fetchPayment(id: string) {
    return this.payments.get(id)!;
  }
}
export type PilotAccount = { id: string; email: string; cookie: string };
export type PilotPair = {
  owner: PilotAccount;
  teacher: PilotAccount;
  learner: any;
  listing: any;
  id: string;
};
export const pilotPassword = "Fictional-pilot-password-321!";

/** Fixture setup only. Measured assertions use HTTP; never accepts owner or remote databases. */
export async function pilotFixture(
  database: Database,
  config: Config,
  base: string,
  provider: PilotProvider,
) {
  const url = new URL(config.databaseUrl);
  if (
    config.mode !== "test" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/pilot_load_test"
  )
    throw new Error("Isolated pilot_load_test database required");
  if (
    Number(
      (await database.pool.query("SELECT count(*) FROM users")).rows[0].count,
    )
  )
    throw new Error("Fresh empty fixture database required");
  const passwordHash = await hashPassword(pilotPassword);
  const accounts: PilotAccount[] = [];
  for (let n = 0; n < 100; n++) {
    const id = randomUUID(),
      token = randomToken(),
      email = `pilot-${n}@example.test`;
    await database.pool.query(
      "INSERT INTO users(id,email,display_name,password_hash,status,email_verified_at) VALUES($1,$2,$3,$4,'ACTIVE',now())",
      [id, email, `Fictional pilot ${n}`, passwordHash],
    );
    await database.pool.query(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [randomUUID(), id, tokenHash(token)],
    );
    accounts.push({
      id,
      email,
      cookie: sessionCookieName(config) + "=" + token,
    });
  }
  const call = async (
    path: string,
    account?: PilotAccount,
    body?: unknown,
    expected = 200,
  ) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: config.webOrigin,
        "Content-Type": "application/json",
        ...(account ? { Cookie: account.cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (response.status !== expected)
      throw new Error(
        `Fixture ${path}: ${response.status} ${data.code || ""} ${data.message || ""}`,
      );
    return data;
  };
  const reviewer = accounts[0];
  await assignStaff(
    database,
    reviewer.email,
    ["TRUST"],
    "Fictional pilot load reviewer",
    "isolated test",
  );
  const enrollment = await call("/v1/staff/mfa/enrollments", reviewer, {
    password: pilotPassword,
  });
  const confirmation = await fetch(base + "/v1/staff/mfa/confirmations", {
    method: "POST",
    headers: {
      Origin: config.webOrigin,
      "Content-Type": "application/json",
      Cookie: reviewer.cookie,
    },
    body: JSON.stringify({ code: totp(enrollment.secret, new Date()) }),
  });
  if (confirmation.status !== 200)
    throw new Error("Fictional staff MFA failed");
  reviewer.cookie +=
    "; " +
    confirmation.headers
      .getSetCookie()
      .find((c) => c.startsWith(staffCookieName(config) + "="))!
      .split(";")[0];
  const teachers = accounts.slice(1, 11);
  const listings: any[] = [];
  for (const [index, teacher] of teachers.entries()) {
    await call("/v1/me/roles", teacher, { roles: ["TUTOR"] });
    await call("/v1/me/tutor", teacher, {
      display_name: `Fictional Physics Tutor ${index}`,
      biography:
        "Patient Physics explanations and structured worked examples for school learners.",
      birth_date: "1990-01-01",
      adult_confirmed: true,
    });
    for (const kind of ["IDENTITY", "QUALIFICATION"]) {
      const file = await call(
        "/v1/me/tutor/evidence",
        teacher,
        {
          media_type: "application/pdf",
          data: Buffer.from(
            "%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n",
          ).toString("base64"),
        },
        201,
      );
      await call(
        "/v1/me/tutor/claims",
        teacher,
        {
          kind,
          description: "Fictional pilot evidence for " + kind,
          evidence_id: file.evidence.id,
          ...(kind === "QUALIFICATION"
            ? { subject_id: "subject-physics" }
            : {}),
        },
        201,
      );
    }
    await call("/v1/me/tutor/submissions", teacher, {});
    for (const claim of (await call("/v1/me/tutor", teacher)).claims)
      await call("/v1/staff/tutor-claims/" + claim.id + "/reviews", reviewer, {
        outcome: "APPROVE",
        checked_item: "Fictional pilot document and subject checked",
        reason: "Isolated fictional performance fixture only",
        adult_identity_confirmed: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
    for (const level of ["level-class-9", "level-class-11", "level-class-10"]) {
      let listing = (
        await call(
          "/v1/me/listings",
          teacher,
          {
            title: `Physics worked examples ${index} ${level}`,
            description:
              "Structured school Physics practice with patient explanations and clear worked examples.",
            domain_id: "school",
            subject_id: "subject-physics",
            level_id: level,
            curriculum_id: "curriculum-cbse",
            language_ids: ["language-english"],
            currency: "INR",
            teaching_mode: "ONLINE",
            rate_paise: 50000,
            rate_unit: "HOUR",
            trial_kind: "NONE",
          },
          201,
        )
      ).listing;
      listing = (
        await call(
          "/v1/me/listings/" + listing.id + "/actions/SUBMIT",
          teacher,
          { revision: listing.revision },
        )
      ).listing;
      listing = (
        await call("/v1/staff/listings/" + listing.id + "/reviews", reviewer, {
          revision: listing.revision,
          outcome: "APPROVE",
          reason: "Exact fictional pilot offer checked",
        })
      ).listing;
      listings.push(listing);
    }
  }
  const pairs: PilotPair[] = [],
    payments: {
      owner: PilotAccount;
      purchase: any;
      payment: ProviderPayment;
      body: any;
      checkoutBody: any;
    }[] = [];
  for (const [n, owner] of accounts.slice(11).entries()) {
    const learner = (
      await call(
        "/v1/me/learners/adult",
        owner,
        {
          alias: "Fictional pilot learner",
          learning_requirements:
            "Understand Physics concepts with worked examples",
          adult_confirmed: true,
        },
        201,
      )
    ).profile;
    const teacher = teachers[n % teachers.length],
      listing = listings[(n % teachers.length) * 3 + 2];
    // Twelve real purchase cycles against an injected provider; remaining history is explicitly test-only access.
    if (n < 12) {
      const checkoutBody = {
        request_key: randomUUID(),
        listing_id: listing.id,
        listing_revision: listing.revision,
        learner_id: learner.id,
        policy_version: "access-v1",
      };
      const purchase = (await call("/v1/me/purchases", owner, checkoutBody))
        .purchase;
      const order = provider.orders.get(purchase.checkout.order_id)!;
      const payment: ProviderPayment = {
        id: "pay_" + randomBytes(8).toString("hex"),
        entity: "payment",
        order_id: order.id,
        amount: 59900,
        currency: "INR",
        status: "captured",
        captured: true,
        created_at: Math.floor(Date.now() / 1000),
      };
      provider.payments.set(payment.id, payment);
      order.status = "paid";
      const body = {
        entity: "event",
        event: "payment.captured",
        created_at: payment.created_at,
        payload: { payment: { entity: payment } },
      };
      payments.push({ owner, purchase, payment, body, checkoutBody });
      // Capture processing is deliberately left to the worker during measured traffic.
      continue;
    }
    await grantContactFixture(database, config, owner.email);
    const request = (
      await call("/v1/me/contact-requests", owner, {
        request_key: randomUUID(),
        listing_id: listing.id,
        listing_revision: listing.revision,
        learner_id: learner.id,
        subject_id: "subject-physics",
        teaching_mode: "ONLINE",
        learning_requirements: "Understand mechanics using worked examples",
        preferred_times: "Tuesday evenings IST",
      })
    ).request;
    const decision = await call(
      "/v1/me/tutor-requests/" + request.id + "/decisions",
      teacher,
      { decision: "ACCEPT" },
    );
    const pair = {
      owner,
      teacher,
      learner,
      listing,
      id: decision.connection_id,
    };
    pairs.push(pair);
    // Representative historical encrypted data, not timed work. Public sends below test new durable commits.
    const conversation = (
      await database.pool.query(
        "SELECT id FROM conversations WHERE connection_id=$1",
        [pair.id],
      )
    ).rows[0];
    for (let sequence = 1; sequence <= 15; sequence++)
      await database.pool.query(
        "INSERT INTO conversation_messages(conversation_id,sequence,sender_id,client_message_id,encrypted_text,created_at) VALUES($1,$2,$3,$4,$5,now())",
        [
          conversation.id,
          sequence,
          owner.id,
          randomUUID(),
          encrypt(
            { text: "Fictional historical Physics discussion " + sequence },
            config.authSecret,
          ),
        ],
      );
    await database.pool.query(
      "UPDATE conversations SET last_sequence=15 WHERE id=$1",
      [conversation.id],
    );
  }
  return { accounts, reviewer, teachers, listings, pairs, payments, call };
}

export function signedCapture(config: Config, body: unknown) {
  const raw = JSON.stringify(body);
  return {
    raw,
    signature: createHmac("sha256", config.payments!.webhookSecret)
      .update(raw)
      .digest("hex"),
  };
}
