import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthService } from './auth.js';
import { Database } from './database.js';
import { ApiProblem } from './errors.js';
import { sessionCookieName, type Config } from './config.js';
import { decrypt, encrypt } from './security.js';

// Incomplete text/selection is deliberate: this is a private working copy,
// never a Tutor profile or a substitute for the final introduction validator.
export const onboardingDraftData = z.strictObject({
  display_name: z.string().max(80).optional(),
  biography: z.string().max(1000).optional(),
  subject_ids: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,79}$/)).max(10)
    .refine(ids => new Set(ids).size === ids.length).optional(),
  hourly_rate_paise: z.number().int().min(0).max(10000000).optional(),
  identity_country: z.enum(['IN', 'OTHER']).optional(),
  identity_document: z.enum(['AADHAAR', 'GOVERNMENT_ID', 'PASSPORT']).optional(),
  adult_confirmed: z.boolean().optional(),
  public_email_consent: z.boolean().optional(),
});
export const onboardingDraftInput = z.strictObject({
  revision: z.number().int().min(0),
  step: z.number().int().min(0).max(4),
  data: onboardingDraftData,
});
const revisionInput = z.strictObject({ revision: z.number().int().positive() });
type DraftRow = { revision: number; step: number; encrypted_payload: Parameters<typeof decrypt>[0]; updated_at: Date };
const conflict = () => new ApiProblem(409, 'REVISION_CONFLICT', 'This draft changed in another session. Refresh it before saving.');

export class TutorOnboardingDrafts {
  constructor(private readonly db: Database, private readonly config: Config,
    private readonly auth: AuthService, private readonly now: () => Date = () => new Date()) {}
  private project(row: DraftRow) {
    return { revision: row.revision, step: row.step,
      data: decrypt<z.infer<typeof onboardingDraftData>>(row.encrypted_payload, this.config.authSecret),
      updated_at: new Date(row.updated_at).toISOString() };
  }
  // Reading a private working copy never requires the Tutor role: any signed-in
  // account may open the teaching workspace, and a reader without a draft simply
  // has none. The role is recorded when the owner first saves (see save()).
  async own(token?: string) {
    return this.db.transaction(async c => {
      const { user } = await this.auth.authenticated(c, token);
      const row = (await c.query('SELECT * FROM tutor_onboarding_drafts WHERE user_id=$1', [user.id])).rows[0];
      return { draft: row ? this.project(row) : null };
    });
  }
  async save(token: string | undefined, input: z.infer<typeof onboardingDraftInput>, correlation: string) {
    return this.db.transaction(async c => {
      // authenticated() locks the owner before the draft, serialising initial
      // creation as well as updates and the first recorded Tutor role selection.
      const { user } = await this.auth.authenticated(c, token);
      // Starting a teaching draft records the Tutor role, exactly as saving an
      // introduction does. The account keeps its Learner role, and nothing is
      // published: the draft stays private until an explicit publication action.
      if (!user.roles.includes('TUTOR')) {
        await c.query("UPDATE users SET roles=array_append(roles,'TUTOR') WHERE id=$1", [user.id]);
        await c.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',
          [randomUUID(), user.id, 'TUTOR_ROLE_SELECTED', correlation, this.now(), { via: 'onboarding-draft' }]);
      }
      const previous = (await c.query('SELECT revision FROM tutor_onboarding_drafts WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];
      if ((previous?.revision ?? 0) !== input.revision) throw conflict();
      const at = this.now();
      const row = (await c.query(`INSERT INTO tutor_onboarding_drafts(user_id,revision,step,encrypted_payload,updated_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET revision=EXCLUDED.revision,
        step=EXCLUDED.step,encrypted_payload=EXCLUDED.encrypted_payload,updated_at=EXCLUDED.updated_at RETURNING *`,
        [user.id, input.revision + 1, input.step, encrypt(input.data, this.config.authSecret), at])).rows[0];
      await c.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), user.id, 'TUTOR_ONBOARDING_DRAFT_SAVED', correlation, at, { revision: row.revision, step: row.step }]);
      return { draft: this.project(row) };
    });
  }
  async clear(token: string | undefined, revision: number, correlation: string) {
    return this.db.transaction(async c => {
      const { user } = await this.auth.authenticated(c, token);
      const row = (await c.query('SELECT revision FROM tutor_onboarding_drafts WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];
      if (!row || row.revision !== revision) throw conflict();
      await c.query('DELETE FROM tutor_onboarding_drafts WHERE user_id=$1', [user.id]);
      await c.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), user.id, 'TUTOR_ONBOARDING_DRAFT_CLEARED', correlation, this.now(), { revision }]);
    });
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Check the draft fields.', z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  return result.data;
}
@Controller('v1/me/tutor/onboarding-draft')
export class TutorOnboardingDraftsController {
  constructor(@Inject(TutorOnboardingDrafts) private readonly drafts: TutorOnboardingDrafts,
    @Inject('AUTH_CONFIG') private readonly config: Config) {}
  private token(r: Request) {
    const prefix = sessionCookieName(this.config) + '=';
    const matches = (r.headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.startsWith(prefix));
    return matches.length === 1 ? matches[0].slice(prefix.length) : undefined;
  }
  @Get() own(@Req() r: Request) { return this.drafts.own(this.token(r)); }
  @Post() @HttpCode(200)
  save(@Req() r: Request & { correlationId: string }, @Body() body: unknown) {
    return this.drafts.save(this.token(r), parse(onboardingDraftInput, body), r.correlationId);
  }
  @Delete() @HttpCode(204)
  clear(@Req() r: Request & { correlationId: string }, @Body() body: unknown) {
    return this.drafts.clear(this.token(r), parse(revisionInput, body).revision, r.correlationId);
  }
}
