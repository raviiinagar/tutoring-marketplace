import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Database } from "./database.js";
import { offerInput, type ListingsService } from "./listings.js";
import type { TutorDelegation } from "./tutor-delegation.js";

/**
 * ADR0021: becoming a Tutor means a live ad. Some Tutors published a profile before that
 * rule and have no available ad, so learners cannot find or contact them. The owner
 * confirmed that these Tutors consented to the team publishing their first ad.
 *
 * `planProfileAds` is read-only: it lists those Tutors and the ad each would get from
 * their own profile, and what the owner must still supply. `applyProfileAds` creates and
 * publishes each ad through the normal ad service acting for the Tutor, so every ad,
 * photo, safety and catalogue rule still applies, and every action is audited under the
 * operator's staff account with the stated consent reason.
 */

export const defaultLanguages = ["language-hindi", "language-english"];

function problem(error: unknown) {
  if (error instanceof HttpException) {
    const body = error.getResponse() as { code?: string; message?: string; field_errors?: Record<string, string[]> };
    const fields = body.field_errors ? " " + JSON.stringify(body.field_errors) : "";
    return `${body.code ?? error.getStatus()}: ${body.message ?? ""}${fields}`;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

export type ProfileAdCandidate = {
  public_id: string;
  display_name: string;
  subjects: { id: string; label: string; domain_ids: string[] }[];
  hourly_rate_paise: number | null;
  teaching_modes: string[];
  city: string | null;
  photo: { status: string; scan_status: string } | null;
  existing_ads: { id: string; status: string }[];
  proposed: Record<string, unknown>;
  missing: string[];
};

const candidatesSql = `
  SELECT p.user_id, p.public_id, p.display_name, p.biography, p.subject_ids, p.hourly_rate_paise,
         COALESCE(tp.teaching_modes, ARRAY['ONLINE']) AS teaching_modes, tp.location->>'city' AS city,
         (SELECT json_build_object('status', ph.status, 'scan_status', ph.scan_status)
            FROM tutor_photos ph WHERE ph.user_id = p.user_id AND ph.status IN ('PENDING','APPROVED')
            ORDER BY ph.created_at DESC LIMIT 1) AS photo,
         COALESCE((SELECT json_agg(json_build_object('id', l.id, 'status', l.status) ORDER BY l.created_at)
            FROM teaching_listings l WHERE l.user_id = p.user_id AND l.archived_at IS NULL), '[]') AS existing_ads
    FROM tutor_profiles p JOIN users u ON u.id = p.user_id
    LEFT JOIN tutor_presence tp ON tp.user_id = p.user_id
   WHERE p.publication_status = 'PUBLISHED' AND u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM teaching_listings l WHERE l.user_id = p.user_id AND l.status = 'PUBLISHED'
                     AND l.archived_at IS NULL AND NOT l.safety_suspended)`;

function title(subject: string, name: string, mode: string) {
  const where = mode === "IN_PERSON" ? "in person" : "online";
  const text = `${subject} classes with ${name}, ${where}, with clear explanations, regular practice and patient feedback for every learner`;
  return text.length <= 160 ? text : `${subject} classes ${where} with clear explanations, regular practice and patient feedback for every learner`;
}

async function candidates(client: PoolClient, publicId?: string) {
  const rows = (await client.query(candidatesSql + (publicId ? " AND p.public_id = $1" : "") + " ORDER BY p.display_name", publicId ? [publicId] : []))
    .rows;
  const terms = (await client.query("SELECT id, label, domain_ids FROM catalogue_terms WHERE kind = 'SUBJECT'")).rows;
  return rows.map((row) => {
    const subjects = (row.subject_ids as string[]).map((id) => {
      const term = terms.find((t) => t.id === id);
      return { id, label: term?.label ?? id, domain_ids: (term?.domain_ids as string[]) ?? [] };
    });
    const first = subjects[0];
    const modes = row.teaching_modes as string[];
    const mode = modes.includes("ONLINE") ? "ONLINE" : "IN_PERSON";
    const domain = first && first.domain_ids.length === 1 ? first.domain_ids[0] : undefined;
    const proposed: Record<string, unknown> = {
      title: first ? title(first.label, row.display_name, mode) : "",
      description: String(row.biography ?? "").trim().slice(0, 1500),
      domain_id: domain,
      subject_id: first?.id,
      language_ids: defaultLanguages,
      currency: "INR",
      teaching_mode: mode,
      rate_paise: row.hourly_rate_paise,
      rate_unit: "HOUR",
      trial_kind: "NONE",
    };
    const missing: string[] = [];
    if (!first) missing.push("subject_id");
    if (!domain) missing.push("domain_id");
    missing.push("level_id");
    if (!domain || domain === "school") missing.push("curriculum_id (school only)");
    if (!domain || domain === "entrance") missing.push("exam_id (entrance only)");
    if (!row.hourly_rate_paise) missing.push("rate_paise");
    if (!proposed.description) missing.push("description");
    if (!row.photo || row.photo.scan_status !== "CLEAN") missing.push("photo (the Tutor must add one in My Account)");
    return {
      user_id: row.user_id as string,
      candidate: {
        public_id: row.public_id,
        display_name: row.display_name,
        subjects,
        hourly_rate_paise: row.hourly_rate_paise,
        teaching_modes: modes,
        city: row.city,
        photo: row.photo,
        existing_ads: row.existing_ads,
        proposed,
        missing,
      } satisfies ProfileAdCandidate,
    };
  });
}

/** Read-only. The template is what the owner fills in for `applyProfileAds`. */
export async function planProfileAds(database: Database) {
  return database.transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const found = (await candidates(client)).map((c) => c.candidate);
    const levels = (await client.query("SELECT id, label, domain_ids FROM catalogue_terms WHERE kind IN ('LEVEL','CURRICULUM','EXAM') AND active ORDER BY kind, id")).rows;
    return {
      candidates: found,
      choices: levels,
      template: found.map((c) => ({
        public_id: c.public_id,
        display_name: c.display_name,
        domain_id: c.proposed.domain_id ?? "",
        level_id: "",
        curriculum_id: "",
        exam_id: "",
        language_ids: defaultLanguages,
      })),
    };
  });
}

export const applyEntry = z.strictObject({
  public_id: z.uuid(),
  display_name: z.string().optional(),
  domain_id: z.string().min(1).optional(),
  level_id: z.string().min(1),
  curriculum_id: z.string().optional(),
  exam_id: z.string().optional(),
  language_ids: z.array(z.string()).min(1).max(3).optional(),
  teaching_mode: z.enum(["ONLINE", "IN_PERSON"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});
export type ApplyEntry = z.infer<typeof applyEntry>;

/**
 * Creates and publishes one ad per entry. Each entry is independent: a failure is
 * reported and the next entry continues. Re-running is safe; a Tutor who already has an
 * available ad is skipped.
 */
export async function applyProfileAds(
  database: Database,
  listings: ListingsService,
  entries: ApplyEntry[],
  operatorEmail: string,
  reason: string,
) {
  if (reason.trim().length < 10) throw new Error("Give a reason of at least 10 characters.");
  const operator = (
    await database.pool.query(
      "SELECT u.id FROM users u JOIN staff_accounts s ON s.user_id = u.id WHERE lower(u.email) = lower($1) AND u.status = 'ACTIVE' AND s.enabled",
      [operatorEmail],
    )
  ).rows[0];
  if (!operator) throw new Error("The operator must be an enabled staff account.");
  const results: { public_id: string; outcome: "PUBLISHED" | "SKIPPED" | "FAILED"; detail: string; listing_id?: string }[] = [];
  for (const raw of entries) {
    const parsed = applyEntry.safeParse(raw);
    if (!parsed.success) {
      results.push({ public_id: String((raw as { public_id?: unknown })?.public_id ?? "?"), outcome: "FAILED", detail: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") });
      continue;
    }
    const entry = parsed.data;
    const found = await database.transaction(async (client) => (await candidates(client, entry.public_id))[0]);
    if (!found) {
      results.push({ public_id: entry.public_id, outcome: "SKIPPED", detail: "Not a published profile without an available ad (already has one, or unknown)." });
      continue;
    }
    const proposed = found.candidate.proposed;
    const offer = offerInput.safeParse(
      Object.fromEntries(
        Object.entries({
          ...proposed,
          domain_id: entry.domain_id ?? proposed.domain_id,
          level_id: entry.level_id,
          curriculum_id: entry.curriculum_id || undefined,
          exam_id: entry.exam_id || undefined,
          language_ids: entry.language_ids ?? proposed.language_ids,
          teaching_mode: entry.teaching_mode ?? proposed.teaching_mode,
          title: entry.title ?? proposed.title,
          description: entry.description ?? proposed.description,
        }).filter(([, v]) => v !== undefined && v !== ""),
      ),
    );
    if (!offer.success) {
      results.push({ public_id: entry.public_id, outcome: "FAILED", detail: offer.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") });
      continue;
    }
    const correlation = randomUUID();
    let audited = false;
    const actor: TutorDelegation = {
      kind: "TUTOR_DELEGATION",
      resolve: async (client) => {
        const user = (await client.query("SELECT * FROM users WHERE id = $1", [found.user_id])).rows[0];
        if (!user || user.status !== "ACTIVE" || !user.email_verified_at) throw new Error("This Tutor account is no longer active.");
        if (!audited) {
          await client.query(
            "INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'TUTOR_FIRST_AD_BY_OPERATOR',$3,now(),$4)",
            [randomUUID(), operator.id, correlation, { tutor: user.id, public_id: entry.public_id, reason: reason.trim() }],
          );
          audited = true;
        }
        return { user, staffId: operator.id };
      },
    };
    let created: { listing: { id: string; revision: number } } | undefined;
    try {
      created = (await listings.create(actor, offer.data, correlation)) as { listing: { id: string; revision: number } };
      const published = (await listings.ownerAction(actor, created.listing.id, "PUBLISH", created.listing.revision, correlation)) as {
        listing: { id: string; status: string };
      };
      results.push({ public_id: entry.public_id, outcome: "PUBLISHED", detail: published.listing.status, listing_id: published.listing.id });
    } catch (error) {
      // Leave nothing half-done: an ad that could not be published is archived, so a
      // re-run starts clean instead of piling up private drafts.
      if (created)
        await listings
          .ownerAction(actor, created.listing.id, "ARCHIVE", created.listing.revision, correlation)
          .catch(() => undefined);
      results.push({ public_id: entry.public_id, outcome: "FAILED", detail: problem(error) });
    }
  }
  return results;
}
