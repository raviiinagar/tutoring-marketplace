import type {PoolClient} from 'pg';
import {ApiProblem} from './errors.js';

export const publicationPolicy='direct-ads-v1';
export const wordCount=(value:string)=>value.trim().split(/\s+/u).filter(Boolean).length;
export function identityVerifiedSql(profile='p',clock='$1',production='$2'){
 return `EXISTS(SELECT 1 FROM tutor_claims identity_claim JOIN tutor_evidence identity_file ON identity_file.id=identity_claim.evidence_id AND identity_file.user_id=identity_claim.user_id WHERE identity_claim.user_id=${profile}.user_id AND identity_claim.profile_revision=${profile}.revision AND identity_claim.kind='IDENTITY' AND identity_claim.status='APPROVED' AND identity_claim.adult_identity_confirmed AND identity_claim.expires_at>${clock} AND identity_file.scan_status='CLEAN' AND (NOT ${production}::boolean OR NOT identity_file.test_only))`;
}
export function publicTutorSql(profile='p',user='u'){
 return `${profile}.publication_status='PUBLISHED' AND ${profile}.adult_declared_at IS NOT NULL AND NOT ${profile}.publication_restricted AND ${user}.status='ACTIVE' AND ${user}.email_verified_at IS NOT NULL AND 'TUTOR'=ANY(${user}.roles) AND (${profile}.onboarding_version<>2 OR NOT EXISTS(SELECT 1 FROM unnest(${profile}.subject_ids) declared_subject(id) WHERE NOT EXISTS(SELECT 1 FROM catalogue_terms declared_term WHERE declared_term.id=declared_subject.id AND declared_term.kind='SUBJECT' AND declared_term.active))) AND NOT EXISTS(SELECT 1 FROM safety_restrictions pub_restriction WHERE pub_restriction.target_type='ACCOUNT' AND pub_restriction.target_id=${user}.id AND pub_restriction.lifted_at IS NULL)`;
}
export function publicPhotoSql(photo='photo'){
 return `(${photo}.status='APPROVED' OR (${photo}.status='PENDING' AND ${photo}.self_published))`;
}
export function assertDeclaredProfile(p:Record<string,any>){
 if(p.publication_restricted)throw new ApiProblem(403,'PUBLICATION_RESTRICTED','Staff must lift the existing publication restriction.');
 if(!p.adult_declared_at)throw new ApiProblem(403,'ADULT_DECLARATION_REQUIRED','Confirm that you are at least 18 before publishing.');
 if(!p.subject_ids?.length||!p.hourly_rate_paise)throw new ApiProblem(409,'PROFILE_INCOMPLETE','Save your subjects and hourly rate before publishing.');
}
export async function identityVerified(c:PoolClient,id:string,at:Date,production:boolean){
 return !!(await c.query(`SELECT ${identityVerifiedSql()} AS verified FROM tutor_profiles p WHERE p.user_id=$3`,[at,production,id])).rows[0]?.verified;
}
