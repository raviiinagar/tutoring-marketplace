import assert from "node:assert/strict";
import type { Test } from "supertest";
import type { Database } from "../../src/database.js";

export type FixturePost = (path: string, body: unknown, cookie?: string) => Test;
type FixtureGet = (path: string, cookie?: string) => Test;
type Owner = { cookie: string };

export const fixtureBiography = "I am a fictional adult Tutor who explains ideas through clear examples, thoughtful questions and guided practice. My lessons follow each learner's goals and provide patient feedback, useful study methods and opportunities to practise independently. We discuss difficulties together and review progress carefully between lessons.";
export const fixtureTitle = "Physics lessons with patient explanations practical examples and guided practice for curious school learners";
export const fixtureDescription = "These fictional lessons explain ideas through clear examples, thoughtful questions and guided practice. Each learner can discuss difficulties, revisit earlier topics and develop useful study habits. Sessions provide patient feedback and practical exercises, with opportunities to practise independently and review progress carefully between lessons.";

export function completeFixtureOffer(payload: Record<string, unknown>) {
  assert.equal(typeof payload.title, "string");
  assert.equal(typeof payload.description, "string");
  const title = String(payload.title);
  const result = {
    ...payload,
    title: title.trim().split(/\s+/).length >= 12 ? title : title + " with patient explanations practical examples and guided practice for curious learners",
    description: String(payload.description).trim().split(/\s+/).length >= 40 ? payload.description : fixtureDescription,
  };
  assert.ok(result.title.length <= 160, "A valid publication fixture title must fit the real limit");
  return result;
}

/** Current complete, private introduction; publication and optional identity review are separate. */
export async function saveTutorIntroduction(post: FixturePost, owner: Owner, profile: { display_name: string; biography: string }, subjects = ["subject-physics"]) {
  return post("/v1/me/tutor/introduction", {
    display_name: profile.display_name, biography: profile.biography,
    subject_ids: subjects, hourly_rate_paise: 50000,
    identity_country: "IN", identity_document: "AADHAAR",
    adult_confirmed: true, public_email_consent: false,
  }, owner.cookie).expect(200);
}

/** Optional qualification reviews must precede identity, which completes the one-ID review state. */
export async function fixtureClaims(get: FixtureGet, cookie: string) {
  const result = await get("/v1/me/tutor", cookie).expect(200);
  return result.body.claims.sort((a: { kind: string }, b: { kind: string }) =>
    Number(a.kind === "IDENTITY") - Number(b.kind === "IDENTITY"));
}

export async function publishProfileFixture(post: FixturePost, get: FixtureGet, owner: Owner) {
  const state = (await get("/v1/me/tutor", owner.cookie).expect(200)).body;
  return post("/v1/me/tutor/publication", {
    expected_public_revision: state.profile.public_revision, action: "PUBLISH",
  }, owner.cookie).expect(200);
}

/** Real publication APIs, no fabricated approval or direct publication-state writes. */
export function publicationFixtures(post: FixturePost, offer: Record<string, unknown>, database?: () => Database) {
  const draft = async (owner: Owner, payload = offer) =>
    (await post("/v1/me/listings", completeFixtureOffer(payload), owner.cookie).expect(201)).body.listing;
  const publishOffer = async (owner: Owner, payload: Record<string, unknown>, id?: string) => {
    const row = await draft(owner, payload);
    if (id) {
      assert.ok(database, "Explicit cursor IDs require the isolated fixture database");
      await database().pool.query("UPDATE teaching_listings SET id=$2 WHERE id=$1", [row.id, id]);
      row.id = id;
    }
    const published = (await post("/v1/me/listings/" + row.id + "/actions/PUBLISH", { revision: row.revision }, owner.cookie).expect(200)).body.listing;
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.eligible, true);
    return published;
  };
  const publish = (owner: Owner) => publishOffer(owner, offer);
  // Existing callers use this name; submission is now direct publication, never a review queue.
  const submitted = publish;
  return { draft, submitted, publish, publishOffer };
}

/** Retire only previous cases' public supply; retain accounts, safety and all money/history. */
export async function isolatePublicationFixture(database: Database) {
  await database.pool.query("UPDATE tutor_profiles SET publication_status='PAUSED',public_revision=public_revision+1 WHERE publication_status='PUBLISHED'");
}
