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

export type CodeMessage = { code: string; message: string };
export type CapturedMail = { id: string; to: string; verification_url?: string; reset_url?: string; captured_at: string; development_only: true };
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

export const api = {
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
