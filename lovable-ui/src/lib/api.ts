/**
 * Typed adapter for the Tutor Marketplace NestJS API.
 * Sessions live in an HttpOnly cookie set by the backend; this module never reads or stores tokens.
 */

export type User = {
  id: string;
  display_name: string;
  email: string;
  email_verified: true;
  created_at: string;
  roles: ('LEARNER' | 'TUTOR')[];
};
export type AccountSession = {id:string;created_at:string;expires_at:string;current:boolean};
export type StaffScope='SUPPORT'|'TRUST'|'FINANCE';
export type StaffAccess={scopes:StaffScope[];mfa_enrolled:boolean;authenticated:boolean;expires_at:string|null};
export type StaffEnrollment={secret:string;otpauth_uri:string;expires_at:string};
export type StaffWorkspace={scope:StaffScope;events:{id:string;actor_id:string;event:string;created_at:string;target:string;reason:string}[]};
export type LearnerProfile={id:string;kind:'ADULT'|'CHILD';alias:string;age_band:'ADULT'|'UNDER_13'|'13_15'|'16_17';learning_requirements:string;status:'ACTIVE'|'WITHDRAWN';usable:boolean;created_at:string;updated_at:string};
export type LearnerPolicy={child_profiles_enabled:boolean;test_only:boolean;policy:{id:string;notice_version:string;consent_version:string;notice:string;consent:string}|null};
export type GuardianCase={id:string;status:'PENDING'|'APPROVED'|'REJECTED'|'REVOKED';policy_id?:string;notice_version?:string;consent_version?:string;created_at?:string;review_reason?:string|null;user_id?:string};
export type GuardianInspection={id:string;user_id:string;status:GuardianCase['status'];policy_id:string;notice_version:string;consent_version:string;evidence:{adult_reference:string;authority_reference:string}};
export type LearnerConsent={accepted:true;notice_version:string;consent_version:string};
export type CatalogueKind='SUBJECT'|'LEVEL'|'CURRICULUM'|'EXAM'|'LANGUAGE';
export type CatalogueTerm={id:string;kind:CatalogueKind;label:string;aliases:string[];domain_ids:string[];active:boolean};
export type Catalogue={domains:{id:string;label:string}[];terms:CatalogueTerm[]};
export type TutorPhoto={id:string;status:'PENDING'|'APPROVED'|'REJECTED'|'REMOVED';scan_status:'CLEAN'|'REJECTED'|'ERROR';test_only:boolean;review_reason:string|null};
export type TutorPhotoState={photo:TutorPhoto|null;policy:{uploads_enabled:boolean;test_only:boolean;max_bytes:number;media_types:string[];notice:string}};
export type TutorPolicy={uploads_enabled:boolean;test_only:boolean;max_bytes:number;media_types:string[]};
export type TutorEvidence={id:string;media_type:string;byte_length:number;scan_status:'QUARANTINED'|'CLEAN'|'REJECTED'|'ERROR'|'WITHDRAWN';test_only:boolean};
export type TutorClaim={id:string;kind:'IDENTITY'|'QUALIFICATION'|'EXPERIENCE';subject_id:string|null;description:string;evidence_id:string;status:string;reviewed_by:string|null;reviewed_at:string|null;expires_at:string|null;review_reason:string|null;reviewed_check:string|null};
export type TutorProfile={display_name:string;biography:string;birth_date:string;revision:number;status:string;eligible:boolean};
export type TutorState={profile:TutorProfile|null;claims:TutorClaim[];evidence:TutorEvidence[]};
export type TeachingOffer={title:string;description:string;domain_id:string;subject_id:string;level_id:string;curriculum_id?:string|undefined;exam_id?:string|undefined;language_ids:string[];currency:'INR';teaching_mode:'ONLINE';rate_paise:number;rate_unit:'HOUR'|'LESSON';lesson_minutes?:number|undefined;trial_kind:'NONE'|'FREE'|'PAID';trial_minutes?:number|undefined;trial_price_paise?:number|undefined};
export type TeachingListing={id:string;user_id:string;offer:TeachingOffer;revision:number;profile_revision:number;status:'DRAFT'|'REVIEW'|'CHANGES_REQUESTED'|'PUBLISHED'|'PAUSED'|'SAFETY_SUSPENDED';eligible:boolean;requires_profile_review:boolean;review_reason:string|null;safety_reason:string|null};
export type ListingQueueItem={id:string;title:string;status:string;safety_suspended:boolean;revision:number};
export type DiscoveryFilters={domain_id?:string|undefined;subject_id?:string|undefined;level_id?:string|undefined;curriculum_id?:string|undefined;exam_id?:string|undefined;language_id?:string|undefined;rate_unit?:'HOUR'|'LESSON'|undefined;min_rate_paise?:number|undefined;max_rate_paise?:number|undefined;cursor?:string|undefined;limit?:number|undefined};
export type IncomingRequest={id:string;offer:TeachingOffer;status:ContactRequest['status'];expires_at:string;created_at:string;learning_requirements:string|null;preferred_times:string|null;can_accept:boolean;can_decline:boolean;unavailable_reason:string|null;connection_id:string|null;test_only:boolean};
export type ConnectionSummary={id:string;request_id:string;listing_id:string;offer:TeachingOffer;status:'ACTIVE'|'PENDING_GRANT';available:boolean;unavailable_reason:string|null;created_at:string;test_only:boolean};
export type ConnectionDetail={id:string;request_id:string;listing_id:string;offer:TeachingOffer;status:'ACTIVE';created_at:string;your_role:'PAYER'|'TUTOR';learner_kind:'ADULT'|'CHILD';learning_requirements:string;preferred_times:string;test_only:boolean};
export type ConnectionPeer={display_name:string;email:string;email_verified:true;role:'TUTOR'|'GUARDIAN'|'ADULT_LEARNER'};
export type ContactRequest={id:string;listing_id:string;learner_id:string;learner_alias:string|null;learner_usable:boolean;offer:TeachingOffer;learning_requirements:string|null;preferred_times:string|null;status:'PENDING'|'ACCEPTED'|'DECLINED'|'EXPIRED'|'CANCELLED';expires_at:string;created_at:string;request_policy_version:string;connection_id:string|null;test_only:boolean};
export type RequestAccess={can_request:boolean;pending_count:number;pending_limit:number;request_policy_version:string;request_ttl_hours:number;checkout_available:false;reason:'ACCESS_REQUIRED'|'PENDING_LIMIT'|null;coverage:{status:'ACTIVE'|'MATCHING';expires_at:string;test_only:true}|null};
export type ContactRequestInput={request_key:string;listing_id:string;listing_revision:number;learner_id:string;subject_id:string;teaching_mode:'ONLINE';learning_requirements:string;preferred_times:string};
export type PublicOffer={id:string;revision:number;tutor:{display_name:string;photo_url?:string};offer:TeachingOffer;available:true;evidence_labels:{kind:'IDENTITY'|'QUALIFICATION'|'EXPERIENCE';label:string;reviewed_at:string;expires_at:string}[];verification_disclaimer:string};
export type DiscoveryPage={offers:PublicOffer[];next_cursor:string|null;limit:number;order:string;price_currency:'INR'};

export type CodeMessage = { code: string; message: string };
export type CapturedMail = { id: string; to: string; verification_url?: string; reset_url?: string; availability_verification_url?:string;availability_unsubscribe_url?:string; captured_at: string; development_only: true };
export type AvailabilityPolicy={consent_version:'availability-v1';purpose:'TUTOR_AVAILABILITY';duration_days:number;max_alerts:number;notice:string};
export const localMailCapture = import.meta.env.DEV && import.meta.env["VITE_DEV_MAIL_CAPTURE"] === "true";

export type ApiFailure =
  | { kind: "unavailable" }
  | {
      kind: "http";
      status: number;
      code: string;
      message: string;
      correlation_id?: string | undefined;
      field_errors?: Record<string, string[]> | undefined;
      retryAfterSeconds?: number | undefined;
    };

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; error: ApiFailure };

export function apiBaseUrl(): string {
  const v = import.meta.env["VITE_API_BASE_URL"];
  return typeof v === "string" ? v.replace(/\/+$/, "") : "";
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  binary=false,
): Promise<ApiResult<T>> {
  const init: RequestInit = { method, credentials: "include", headers: { Accept: "application/json" } };
  if (method !== "GET") {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body ?? {});
  }
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, init);
  } catch {
    return { ok: false, error: { kind: "unavailable" } };
  }

  if (res.status === 204) return { ok: true, status: 204, data: undefined as T };
  if(res.ok&&binary)return {ok:true,status:res.status,data:await res.blob() as T};

  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  let json: unknown = null;
  if (isJson) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }

  if (res.ok) {
    if (json === null) return { ok: false, error: { kind: "unavailable" } };
    return { ok: true, status: res.status, data: json as T };
  }

  // A non-JSON error (e.g. an HTML 404 from a host with no API behind /v1) means the service isn't connected.
  if (json === null || typeof json !== "object") {
    if (res.status === 429) {
      return { ok: false, error: { kind: "http", status: 429, code: "RATE_LIMITED", message: "" } };
    }
    return { ok: false, error: { kind: "unavailable" } };
  }
  const e = json as Partial<Extract<ApiFailure, { kind: "http" }>>;
  const ra = Number(res.headers.get("retry-after"));
  return {
    ok: false,
    error: {
      kind: "http",
      status: res.status,
      code: typeof e.code === "string" ? e.code : "UNKNOWN_ERROR",
      message: typeof e.message === "string" ? e.message : "",
      correlation_id: e.correlation_id,
      field_errors: e.field_errors,
      retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? ra : undefined,
    },
  };
}

export const assetUrl=(path:string)=>apiBaseUrl()+path;
export const api = {
  tutorPhoto:()=>request<TutorPhotoState>('GET','/v1/me/tutor/photo'),
  uploadTutorPhoto:(media_type:string,data:string)=>request<{photo:TutorPhoto}>('POST','/v1/me/tutor/photo',{media_type,data,public_consent:true}),
  removeTutorPhoto:(id:string)=>request<void>('DELETE','/v1/me/tutor/photo/'+encodeURIComponent(id)),
  photoPreviewUrl:(id:string)=>assetUrl('/v1/me/tutor/photo/'+encodeURIComponent(id)),
  tutorPhotoQueue:()=>request<{photos:(TutorPhoto&{display_name:string})[]}>('GET','/v1/staff/tutor-photos'),
  inspectTutorPhoto:(id:string,reason:string)=>request<Blob>('POST','/v1/staff/tutor-photos/'+encodeURIComponent(id)+'/inspections',{reason},true),
  reviewTutorPhoto:(id:string,outcome:'APPROVE'|'REJECT'|'REVOKE',reason:string)=>request<{photo:TutorPhoto}>('POST','/v1/staff/tutor-photos/'+encodeURIComponent(id)+'/reviews',{outcome,reason}),
  availabilityPolicy: () => request<AvailabilityPolicy>('GET','/v1/availability/policy'),
  subscribeAvailability: (email:string,selection:DiscoveryFilters,consent:boolean,adult_confirmed:boolean,consent_version:string) => request<CodeMessage>('POST','/v1/availability/subscriptions',{email,selection,consent,adult_confirmed,consent_version}),
  confirmAvailability: (token:string) => request<CodeMessage>('POST','/v1/availability/confirmations',{token}),
  unsubscribeAvailability: (token:string) => request<CodeMessage>('POST','/v1/availability/unsubscriptions',{token}),
  discover: (filters:DiscoveryFilters={}) => {const query=new URLSearchParams();for(const [key,value] of Object.entries(filters))if(value!==undefined&&value!=='')query.set(key,String(value));return request<DiscoveryPage>('GET','/v1/discovery'+(query.size?'?'+query.toString():''));},
  publicTutorOffer: (id:string) => request<{listing:PublicOffer}>('GET','/v1/discovery/'+encodeURIComponent(id)),
  listings: () => request<{listings:TeachingListing[]}>('GET','/v1/me/listings'),
  createListing: (offer:TeachingOffer) => request<{listing:TeachingListing}>('POST','/v1/me/listings',offer),
  editListing: (id:string,revision:number,offer:TeachingOffer) => request<{listing:TeachingListing}>('POST','/v1/me/listings/'+encodeURIComponent(id),{revision,offer}),
  listingAction: (id:string,revision:number,action:'SUBMIT'|'PAUSE'|'RESUME') => request<{listing:TeachingListing}>('POST','/v1/me/listings/'+encodeURIComponent(id)+'/actions/'+action,{revision}),
  listingQueue: () => request<{listings:ListingQueueItem[]}>('GET','/v1/staff/listings'),
  inspectListing: (id:string,reason:string) => request<{listing:TeachingListing}>('POST','/v1/staff/listings/'+encodeURIComponent(id)+'/inspections',{reason}),
  reviewListing: (id:string,revision:number,outcome:'APPROVE'|'CHANGES_REQUESTED',reason:string) => request<{listing:TeachingListing}>('POST','/v1/staff/listings/'+encodeURIComponent(id)+'/reviews',{revision,outcome,reason}),
  listingSafety: (id:string,revision:number,action:'SUSPEND'|'LIFT',reason:string) => request<{listing:TeachingListing}>('POST','/v1/staff/listings/'+encodeURIComponent(id)+'/safety',{revision,action,reason}),
  tutorPolicy: () => request<TutorPolicy>('GET','/v1/tutor-policy'),
  tutor: () => request<TutorState>('GET','/v1/me/tutor'),
  saveTutor: (display_name:string,biography:string,birth_date:string,adult_confirmed:boolean) => request<TutorState>('POST','/v1/me/tutor',{display_name,biography,birth_date,adult_confirmed}),
  uploadTutorEvidence: (media_type:string,data:string) => request<{evidence:TutorEvidence}>('POST','/v1/me/tutor/evidence',{media_type,data}),
  withdrawTutorEvidence: (id:string) => request<void>('DELETE','/v1/me/tutor/evidence/'+encodeURIComponent(id)),
  tutorClaim: (kind:TutorClaim['kind'],description:string,evidence_id:string,subject_id?:string) => request<TutorState>('POST','/v1/me/tutor/claims',{kind,description,evidence_id,...(subject_id?{subject_id}:{})}),
  submitTutor: () => request<TutorState>('POST','/v1/me/tutor/submissions'),
  tutorQueue: () => request<{profiles:{user_id:string;display_name:string;revision:number;status:string}[]}>('GET','/v1/staff/tutors'),
  inspectTutor: (id:string,reason:string) => request<TutorState>('POST','/v1/staff/tutors/'+encodeURIComponent(id)+'/inspections',{reason}),
  reviewTutorClaim: (id:string,outcome:string,checked_item:string,reason:string,adult_identity_confirmed:boolean,expires_at?:string) => request<TutorState>('POST','/v1/staff/tutor-claims/'+encodeURIComponent(id)+'/reviews',{outcome,checked_item,reason,adult_identity_confirmed,...(expires_at?{expires_at}:{})}),
  tutorDownloadGrant: (id:string,reason:string) => request<{token:string;expires_at:string}>('POST','/v1/staff/tutor-evidence/'+encodeURIComponent(id)+'/download-grants',{reason}),
  downloadTutorEvidence: (token:string) => request<Blob>('POST','/v1/staff/tutor-evidence/downloads',{token},true),
  catalogue: () => request<Catalogue>('GET','/v1/catalogue'),
  staffCatalogue: () => request<Catalogue>('GET','/v1/staff/catalogue'),
  saveCatalogueTerm: (term:CatalogueTerm,reason:string) => request<{term:CatalogueTerm}>('POST','/v1/staff/catalogue/terms',{...term,reason}),
  capturedMail: () => localMailCapture
    ? request<{development_only:true;messages:CapturedMail[]}>("GET", "/dev/mail")
    : Promise.resolve<ApiResult<{development_only:true;messages:CapturedMail[]}>>({ok:false,error:{kind:"unavailable"}}),
  register: (input: { display_name: string; email: string; password: string }) =>
    request<CodeMessage>("POST", "/v1/auth/registrations", {
      display_name: input.display_name,
      email: input.email,
      password: input.password,
    }),
  resendVerification: (email: string) =>
    request<CodeMessage>("POST", "/v1/auth/verification-emails", { email }),
  verifyEmail: (token: string) => request<CodeMessage>("POST", "/v1/auth/verifications", { token }),
  signIn: (input: { email: string; password: string }) =>
    request<{ user: User }>("POST", "/v1/auth/sessions", { email: input.email, password: input.password }),
  tutorRequests: (cursor?:string) => request<{requests:IncomingRequest[];next_cursor:string|null}>('GET','/v1/me/tutor-requests'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  decideRequest: (id:string,decision:'ACCEPT'|'DECLINE') => request<{request_id:string;status:'ACCEPTED'|'DECLINED';connection_id:string|null;connection_status:'ACTIVE'|'PENDING_GRANT'|null;replayed:boolean}>('POST','/v1/me/tutor-requests/'+encodeURIComponent(id)+'/decisions',{decision}),
  connections: (cursor?:string) => request<{connections:ConnectionSummary[];next_cursor:string|null}>('GET','/v1/me/connections'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  connection: (id:string) => request<{connection:ConnectionDetail}>('GET','/v1/me/connections/'+encodeURIComponent(id)),
  connectionContacts: (id:string) => request<{peer:ConnectionPeer}>('GET','/v1/me/connections/'+encodeURIComponent(id)+'/contacts'),
  requestAccess: () => request<RequestAccess>('GET','/v1/me/request-access'),
  sendContactRequest: (input:ContactRequestInput) => request<{request:ContactRequest;replayed:boolean}>('POST','/v1/me/contact-requests',input),
  contactRequests: (cursor?:string) => request<{requests:ContactRequest[];next_cursor:string|null}>('GET','/v1/me/contact-requests'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  contactRequest: (id:string) => request<{request:ContactRequest}>('GET','/v1/me/contact-requests/'+encodeURIComponent(id)),
  me: () => request<{ user: User }>("GET", "/v1/me"),
  recoveryEmail: (email:string) => request<CodeMessage>('POST','/v1/auth/recovery-emails',{email}),
  resetPassword: (token:string,password:string) => request<CodeMessage>('POST','/v1/auth/password-resets',{token,password}),
  changeRoles: (roles:User['roles']) => request<{user:User}>('POST','/v1/me/roles',{roles}),
  sessions: () => request<{sessions:AccountSession[]}>('GET','/v1/auth/sessions'),
  revokeSession: (id:string) => request<void>('DELETE','/v1/auth/sessions/by-id/'+encodeURIComponent(id)),
  revokeOthers: () => request<void>('DELETE','/v1/auth/sessions/others'),
  staffAccess: () => request<StaffAccess>('GET','/v1/staff/access'),
  enrollMfa: (password:string) => request<StaffEnrollment>('POST','/v1/staff/mfa/enrollments',{password}),
  confirmMfa: (code:string) => request<{recovery_codes:string[]}>('POST','/v1/staff/mfa/confirmations',{code}),
  staffSignIn: (password:string,code:string) => request<{expires_at:string}>('POST','/v1/staff/sessions',{password,code}),
  recoverMfa: (password:string,recovery_code:string) => request<CodeMessage>('POST','/v1/staff/mfa/recoveries',{password,recovery_code}),
  staffSignOut: () => request<void>('DELETE','/v1/staff/sessions/current'),
  staffWorkspace: (scope:StaffScope) => request<StaffWorkspace>('GET','/v1/staff/workspaces/'+scope),
  staffAccessCheck: (scope:StaffScope,reason:string) => request<StaffWorkspace>('POST','/v1/staff/workspaces/'+scope+'/access-checks',{reason}),
  learnerPolicy: () => request<LearnerPolicy>('GET','/v1/learner-policy'),
  learners: () => request<{profiles:LearnerProfile[]}>('GET','/v1/me/learners'),
  adultLearner: (alias:string,learning_requirements:string,adult_confirmed:boolean) => request<{profile:LearnerProfile}>('POST','/v1/me/learners/adult',{alias,learning_requirements,adult_confirmed}),
  childLearner: (alias:string,learning_requirements:string,age_band:string,consent:LearnerConsent) => request<{profile:LearnerProfile}>('POST','/v1/me/learners/children',{alias,learning_requirements,age_band,consent}),
  editLearner: (id:string,alias:string,learning_requirements:string) => request<{profile:LearnerProfile}>('POST','/v1/me/learners/'+encodeURIComponent(id),{alias,learning_requirements}),
  withdrawLearnerConsent: (id:string) => request<CodeMessage>('POST','/v1/me/learners/'+encodeURIComponent(id)+'/consent-withdrawals'),
  renewLearnerConsent: (id:string,consent:LearnerConsent) => request<CodeMessage>('POST','/v1/me/learners/'+encodeURIComponent(id)+'/consents',consent),
  guardianCases: () => request<{verifications:GuardianCase[]}>('GET','/v1/me/guardian-verifications'),
  submitGuardian: (adult_reference:string,authority_reference:string,adult_confirmed:boolean,consent:LearnerConsent) => request<{id:string;status:'PENDING'}>('POST','/v1/me/guardian-verifications',{adult_reference,authority_reference,adult_confirmed,consent}),
  guardianQueue: () => request<{verifications:GuardianCase[]}>('GET','/v1/staff/guardian-verifications'),
  inspectGuardian: (id:string,reason:string) => request<{verification:GuardianInspection}>('POST','/v1/staff/guardian-verifications/'+encodeURIComponent(id)+'/inspections',{reason}),
  reviewGuardian: (id:string,decision:'APPROVE'|'REJECT'|'REVOKE',identifiable_adult_reviewed:boolean,authority_reviewed:boolean,reason:string) => request<{id:string;status:GuardianCase['status']}>('POST','/v1/staff/guardian-verifications/'+encodeURIComponent(id)+'/reviews',{decision,identifiable_adult_reviewed,authority_reviewed,reason}),
  signOut: () => request<void>("DELETE", "/v1/auth/sessions/current", {}),
};

/** Human-readable message for a failure; callers override for specific codes. */
export function describeFailure(error: ApiFailure): string {
  if (error.kind === "unavailable") {
    return "Account service is not connected. Please try again later.";
  }
  if (error.status === 429 || error.code === "RATE_LIMITED") {
    const wait = error.retryAfterSeconds ? ` in about ${error.retryAfterSeconds} seconds` : " in a minute";
    return `Too many attempts. Please wait and try again${wait}.`;
  }
  if (error.status >= 500) {
    const ref = error.correlation_id ? ` (Reference: ${error.correlation_id})` : "";
    return `The account service had a problem. Please try again shortly.${ref}`;
  }
  return error.message || "Something went wrong. Please try again.";
}
