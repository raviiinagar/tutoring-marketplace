import { expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

/** Fictional accounts on the isolated loopback browser stack only. */
export async function auditAccount(client: APIRequestContext, origin: string) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Audit fixtures require isolated loopback hosting.");
  const email = "audit-ui-" + randomUUID() + "@example.test";
  const password = "Fictional-audit-password-321!";
  expect((await client.post("/v1/auth/registrations", {
    headers: { Origin: origin },
    data: { display_name: "Fictional Audit Learner", email, password },
  })).status()).toBe(202);
  let link = "";
  await expect.poll(async () => {
    const inbox = await (await client.get("/dev/mail")).json();
    link = inbox.messages.find((message: { to: string }) => message.to === email)?.verification_url || "";
    return !!link;
  }, { timeout: 20000 }).toBe(true);
  expect((await client.post("/v1/auth/verifications", {
    headers: { Origin: origin }, data: { token: new URL(link).hash.slice(7) },
  })).ok()).toBe(true);
  expect((await client.post("/v1/auth/sessions", {
    headers: { Origin: origin }, data: { email, password },
  })).ok()).toBe(true);
}

export async function auditSupply(client: APIRequestContext, origin: string) {
  await auditAccount(client, origin);
  const post = async (path: string, data: unknown) => {
    const response = await client.post(path, { headers: { Origin: origin }, data });
    expect(response.ok(), path).toBe(true);
    return response.json();
  };
  const biography = "Fictional audit lessons explore Physics through clear explanations, practical examples, careful questions and guided exercises. Students can discuss difficulties, practise earlier topics, learn useful study methods and receive patient feedback. Each session follows the learner goals and supports steady progress with thoughtful independent practice between classes.";
  await post("/v1/me/roles", { roles: ["TUTOR"] });
  await post("/v1/me/tutor/introduction", {
    display_name: "Fictional Audit Tutor", biography, subject_ids: ["subject-physics"],
    hourly_rate_paise: 65000, identity_country: "IN", identity_document: "AADHAAR",
    adult_confirmed: true, public_email_consent: false,
  });
  const { listing } = await post("/v1/me/listings", {
    title: "Fictional Physics lessons with patient guided practice and clear examples for curious school learners",
    description: biography, domain_id: "school", subject_id: "subject-physics",
    level_id: "level-class-10", curriculum_id: "curriculum-cbse", language_ids: ["language-english"],
    currency: "INR", teaching_mode: "ONLINE", rate_paise: 65000, rate_unit: "HOUR", trial_kind: "NONE",
  });
  await post("/v1/me/listings/" + listing.id + "/actions/PUBLISH", { revision: listing.revision });
}
