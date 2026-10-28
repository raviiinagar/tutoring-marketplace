/**
 * Typed adapter for the Tutor Marketplace NestJS API.
 * Sessions live in an HttpOnly cookie set by the backend; this module never reads or stores tokens.
 */

export type AdminAccount={id:string;display_name:string;email:string;status:string;roles:string[];created_at:string;email_verified_at:string|null;last_sign_in_at:string|null};
export type AdminOverview={as_of:string;days:number;timezone:string;environment:string;test_only:boolean;scopes:StaffScope[];audience:{accounts_total:number;verified_accounts:number;new_accounts:number;successful_logins:number;signed_in_accounts:number;valid_sessions:number;visits:number|null;page_views:number|null;tracking_started_at:string|null};business:{enquiries:number;pending_enquiries:number;accepted_enquiries:number};finance:null|{captured_paise:number;captures:number;unexpected_paise:number;coupon_redemptions:number;free_passes:number;coupon_discount_paise:number;refunded_paise:number};trend:{day:string;signups:number;logins:number;visits:number|null}[];queues:{key:string;label:string;count:number;href:string}[];alerts:{code:string;scope:string;count:number;opened_at:string}[];workers:{name:string;last_success_at:string|null;consecutive_errors:number}[];activity:{id:string;event_type:string;created_at:string}[]};
export type User = {
  id: string;
  display_name: string;
  email: string;
  email_verified: true;
  created_at: string;
  roles: ('LEARNER' | 'TUTOR')[];
};
export type AccountSession = {id:string;created_at:string;expires_at:string;current:boolean};
export type ClassInvitation={id:string;title:string;starts_at:string;ends_at:string;duration_minutes:number;status:'SCHEDULED'|'CANCELLED';revision:number;updated_at:string;can_join:boolean;meet_url?:string|null};
export type ClassDetails={title:string;starts_at:string;duration_minutes:number;meet_url:string};
export type ClassInvitations={viewer_role:'TUTOR'|'PAYER';server_time:string;classes:ClassInvitation[]};
export type SupportPolicy={hours:string;timezone:string;open_now:boolean;next_opening_at:string|null;notice:string};
export type SupportEvent={id:string;outcome:string;visibility:'USER'|'INTERNAL';created_at:string;message?:string;reason?:string;actor_id?:string;source_result?:{refund_case_id?:string;cycle_id?:string;outcome?:string}};
export type SupportCase={id:string;category:string;required_scope:StaffScope;status:string;revision:number;assigned:boolean;assigned_to?:string|null;source_id:string|null;related_id:string|null;source_revision:number|null;created_at:string;updated_at:string;subject?:string;description?:string;events?:SupportEvent[]};
export type SupportOperation='CLAIM'|'RELEASE'|'NOTE'|'REPLY'|'RESOLVE'|'UPHOLD'|'SUPERSEDED'|'REOPEN_REVIEW'|'LIFT_ACCOUNT'|'LIFT_LISTING'|'LIFT_CONNECTION'|'RECONSIDER_REFUND';
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
export type PaymentHistoryRow={id:string;amount_paise:number;currency:string;status:string;created_at:string;resolution_required:boolean;test_only:boolean;receipt_available:boolean;captures:{kind:string;amount_paise:string;currency:string}[];reversals:{kind:string;amount_paise:string;currency:string}[]};
export type PaymentDocument={id:string;number:string;purchase_id:string;kind:string;merchant:string;invoice_notice:string;amount_paise:number;base_paise:number;tax_paise:number;currency:string;paid_at:string;issued_at:string;test_only:boolean;description:string;tax_document_notice:string};
export type ReconciliationView={totals_by_currency:{currency:string;total_debits_minor:number;total_credits_minor:number}[];totals:{total_debits_paise:number;total_credits_paise:number;gateway_fee_paise:number;gateway_tax_paise:number;bank_received_paise:number};runs:{id:string;status:string;last_error:string|null}[];settlements:{id:string;amount_paise:string;status:string;bank_matched:boolean}[]};
export type RefundCase={id:string;cycle_id:string;status:'OPEN'|'APPROVED'|'DECLINED';reason:string;review_reason:string|null;reviewed_by:string|null;amount_paise:number|null;access_treatment:'KEEP'|'REVOKE_FUTURE'|null;operation_id:string|null;created_at:string;reviewed_at:string|null};
export type RefundOperation={id:string;amount_paise:number;currency:string;reason:string;status:string;provider_refund_id:string|null;last_error:string|null;attempts:number;created_at:string;updated_at:string};
export type RefundState={can_review:boolean;cancelled:boolean;can_cancel:boolean;refunds:RefundOperation[];bank_notice:string};
export type IncomingRequest={server_time:string;reminder:'DUE_SOON'|'EXPIRED'|null;id:string;offer:TeachingOffer;status:ContactRequest['status'];expires_at:string;created_at:string;learning_requirements:string|null;preferred_times:string|null;can_accept:boolean;can_decline:boolean;unavailable_reason:string|null;connection_id:string|null;test_only:boolean};
export type ConnectionSummary={id:string;request_id:string;listing_id:string;offer:TeachingOffer;status:'ACTIVE'|'PENDING_GRANT';available:boolean;unread_count:number|null;unavailable_reason:string|null;created_at:string;test_only:boolean};
export type ChatMessage={sequence:number;client_message_id:string;text:string;sender_role:'TUTOR'|'PAYER';your_message:boolean;created_at:string};
export type ChatReadState={read_sequence:number;peer_read_sequence:number;unread_count:number};
export type SafetyKind='connection'|'request';
export type SafetyCategory='HARASSMENT'|'FRAUD'|'CHILD_SAFETY'|'OTHER';
export type SafetyOperation='RESTRICT_ACCOUNT'|'LIFT_ACCOUNT'|'RESTRICT_LISTING'|'LIFT_LISTING'|'RESTRICT_CONNECTION'|'LIFT_CONNECTION'|'RESOLVE'|'DISMISS';
export type SafetyContext={actor_id:string;offer_title:string;blocked_by_you:boolean;communication_blocked:boolean;peer_role:'TUTOR'|'PAYER'};
export type SafetyCase={id:string;status:'OPEN'|'RESOLVED'|'DISMISSED';category:SafetyCategory;revision:number;created_at:string;public_notice:string|null;relationship?:'REPORTER'|'SUBJECT';can_appeal?:boolean};
export type SafetyRestriction={id:string;case_id?:string;target_type:'ACCOUNT'|'LISTING'|'CONNECTION';reason:string;created_at:string;lifted_at:string|null;lift_reason:string|null};
export type SafetyAppeal={id:string;case_id:string;case_revision:number;status:'PENDING_REVIEW'|'RESOLVED';created_at:string;description?:string};
export type SafetyCenter={actor_id:string;cases:SafetyCase[];restrictions:SafetyRestriction[];blocks:{kind:SafetyKind;target_id:string;offer_title:string}[];appeals:SafetyAppeal[]};
export type SafetyCaseView=SafetyCase&{description:string;connection_id:string|null;request_id:string;evidence:{offer_title:string;messages:Omit<ChatMessage,'client_message_id'|'your_message'>[];initial_request?:{learning_requirements:string;preferred_times:string}};restrictions:SafetyRestriction[];appeals:SafetyAppeal[]};
export type ChatState=ChatReadState&{connection_id:string;conversation_id:string;offer_title:string;your_role:'TUTOR'|'PAYER';learner_kind:'ADULT'|'CHILD';messages:ChatMessage[];last_sequence:number;next_after:number;has_more:boolean;has_older:boolean};
export type ConnectionDetail={id:string;request_id:string;listing_id:string;offer:TeachingOffer;status:'ACTIVE';created_at:string;your_role:'PAYER'|'TUTOR';learner_kind:'ADULT'|'CHILD';learning_requirements:string;preferred_times:string;test_only:boolean};
export type ConnectionPeer={display_name:string;email:string;email_verified:true;role:'TUTOR'|'GUARDIAN'|'ADULT_LEARNER'};
export type ContactRequest={server_time:string;reminder:'DUE_SOON'|'EXPIRED'|null;id:string;listing_id:string;learner_id:string;learner_alias:string|null;learner_usable:boolean;offer:TeachingOffer;learning_requirements:string|null;preferred_times:string|null;status:'PENDING'|'ACCEPTED'|'DECLINED'|'EXPIRED'|'CANCELLED';expires_at:string;created_at:string;request_policy_version:string;connection_id:string|null;test_only:boolean};
export type CouponQuote={code:string;base_paise:number;discount_paise:number;total_paise:number;percent_off:number;currency:string;expires_at:string;payment_required:boolean};
export type CouponRedemption={id:string;code:string;base_paise:number;discount_paise:number;total_paise:number;percent_off:number;created_at:string;purchase_id:string|null;access:{status:'MATCHING'|'ACTIVE'|'EXPIRED'|'REVOKED';matching_deadline:string;starts_at:string|null;ends_at:string|null}|null};
export type CouponCampaign={id:string;code:string;percent_off:number;starts_at:string;expires_at:string;max_uses:number;enabled:boolean;uses:number};
export type RequestAccess={can_request:boolean;pending_count:number;pending_limit:number;request_policy_version:string;request_ttl_hours:number;checkout_available:boolean;reason:'ACCESS_REQUIRED'|'PENDING_LIMIT'|null;coverage:{source?:'PAYMENT'|'COUPON'|'FIXTURE';status:'ACTIVE'|'MATCHING';expires_at:string;id:string;purchase_id:string|null;starts_at:string|null;ends_at:string|null;test_only:boolean}|null};
export type ContactRequestInput={request_key:string;listing_id:string;listing_revision:number;learner_id:string;subject_id:string;teaching_mode:'ONLINE';learning_requirements:string;preferred_times:string};
export type PublicOffer={public_path?:string;review_summary?:{count:number;average:number|null;label:string};id:string;revision:number;tutor:{display_name:string;photo_url?:string};offer:TeachingOffer;available:true;evidence_labels:{kind:'IDENTITY'|'QUALIFICATION'|'EXPERIENCE';label:string;reviewed_at:string;expires_at:string}[];verification_disclaimer:string};
export type DiscoveryPage={offers:PublicOffer[];next_cursor:string|null;limit:number;order:string;price_currency:'INR'};

export type PaymentDisclosure={merchant:string;invoice_notice:string;base_paise:number;tax_paise:number;test_only:boolean};
export type PaymentPolicy={policy:{version:'access-v1';amount_paise:number;currency:'INR';access_days:number;matching_hours:number};checkout_available:boolean;disclosures:PaymentDisclosure|null};
export type CheckoutConfirmation={razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string};
export type Purchase={coupon?:Pick<CouponQuote,'code'|'base_paise'|'discount_paise'|'total_paise'|'percent_off'>|null;id:string;status:'CREATING'|'ORDER_READY'|'UNKNOWN'|'VERIFYING'|'CAPTURED'|'REVIEW';policy_version:string;amount_paise:number;currency:string;created_at:string;captured_at:string|null;matching_deadline:string|null;resolution_required:boolean;requires_alternative:boolean;payment_attempt_failed:boolean;access_active:boolean;access:{status:'MATCHING'|'ACTIVE'|'EXPIRED'|'UNAVAILABLE';starts_at:string|null;ends_at:string|null;test_only:boolean};disclosures:PaymentDisclosure;journal:{kind:string;amount_paise:string;currency:string;captured_at:string}[];checkout:{key_id:string;order_id:string;amount:number;currency:string;merchant:string}|null};
export type CodeMessage = { code: string; message: string };
export type NotificationRecord={id:string;target_id:string;template:string;template_version:string;category:string;channel:'EMAIL'|'SMS';mandatory:boolean;status:string;attempts:number;last_error:string|null;provider_reference:string|null;created_at:string;sent_at:string|null;test_only:boolean};
export type NotificationPreferences={enquiry_email:boolean;chat_email:boolean;availability_email:boolean;marketing_email:boolean;notice_version:'notification-preferences-v1'};
export type NotificationPreferenceView={preferences:NotificationPreferences;service_email:true;policy:{notice:string}};
export type NotificationHistory={notifications:NotificationRecord[];delivery_mode:'LOCAL_CAPTURE'|'PROVIDER'};
export type NotificationQueue=NotificationHistory&{sms_configured:boolean;sms_daily_limit:number};
export type CapturedMail = { id: string; to: string; subject?:string;text?:string;notification_url?:string;verification_url?: string; reset_url?: string; availability_verification_url?:string;availability_unsubscribe_url?:string; captured_at: string; development_only: true };
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
    // This isolated branch must never render data from the ordinary staging API.
    const origin=import.meta.env.SSR?'https://ravii-tutoring-test.duckdns.org/payment-sandbox':apiBaseUrl();
    if(import.meta.env.SSR)init.signal=AbortSignal.timeout(5000);
    res = await fetch(`${origin}${path}`, init);
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
export const publicPortraitUrl=(path:string,variant:'card'|'portrait')=>assetUrl(path+'?variant='+variant);
export function subscribeChat(id:string,after:number,onState:(state:ChatState)=>void,onDisconnect:(revoked:boolean)=>void){
 const path='/v1/me/connections/'+encodeURIComponent(id);
 const source=new EventSource(apiBaseUrl()+path+'/events?after='+after,{withCredentials:true});
 let active=true,polling=false,cursor=after;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{active=false;clearTimeout(timer);source.close();};
 const disconnect=(revoked:boolean)=>{if(!active)return;stop();onDisconnect(revoked);};
 const poll=async()=>{
   if(!active||!polling)return;
   const result=await request<ChatState>('GET',path+'/messages?after='+cursor+'&limit=100');
   if(!active)return;
   if(!result.ok){disconnect(result.error.kind==='http'&&[401,403,404].includes(result.error.status));return;}
   cursor=Math.max(cursor,result.data.next_after);
   onState(result.data);
   if(active)timer=setTimeout(()=>void poll(),result.data.has_more?0:2000);
 };
 // Some hosting proxies buffer an open event stream indefinitely. Fall back
 // to the same participant-authorized history endpoint if no frame arrives.
 timer=setTimeout(()=>{if(!active)return;polling=true;source.close();void poll();},3000);
 source.addEventListener('state',event=>{
   if(!active||polling)return;
   clearTimeout(timer);
   try{const frame=JSON.parse((event as MessageEvent).data) as ChatState;cursor=Math.max(cursor,frame.next_after);onState(frame);}catch{disconnect(false);}
 });
 source.addEventListener('access-revoked',()=>disconnect(true));
 source.addEventListener('reconnect',()=>{if(!polling)disconnect(false);});
 source.onerror=()=>{if(!polling)disconnect(false);};
 return stop;
}
export type ReviewRow={id:string;connection_id:string;rating:number;text:string|null;status:string;revision:number;created_at:string;test_only:boolean;relationship?:'AUTHOR'|'TUTOR';decisions?:{id:string;outcome:string;policy_code:string;reason:string;created_at:string}[];appeals?:{id:string;status:string;review_revision:number}[]};
export type ReviewContext={eligible:boolean;eligible_at:string;server_time:string;review:ReviewRow|null;policy_version:'review-v1';policy:string};
export type PublicReviewPage={reviews:{id:string;rating:number;text:string;reviewer:string;created_at:string;label:string}[];summary:{count:number;average:number|null};next_cursor:string|null;disclaimer:string};
export type PrivacyKind='EXPORT'|'DELETE'|'WITHDRAW';
export type RetentionClass={id?:string;class:string;purpose:string;expires_at:string;purged:boolean;held:boolean;scope?:StaffScope};
export type PrivacyPolicy={exports_enabled:boolean;deletion_enabled:boolean;withdrawal_enabled:boolean;retention_policy:null|{id:string;test_only:boolean;classes:Record<string,{days:number;purpose:string}>};notice:string;export_expires_hours:number;verification_minutes:number};
export type PrivacyRequest={id:string;kind:PrivacyKind;status:string;created_at:string;completed_at:string|null;last_error:string|null;result:{expires_at?:string;byte_length?:number;retained?:RetentionClass[];propagation?:Record<string,string>}};
export type PrivacyState={authenticated:boolean;policy:PrivacyPolicy;requests:PrivacyRequest[];child_profiles?:{id:string;alias:string}[]};
export type PrivacyRetained=RetentionClass&{id:string;request_id:string;holds:{id:string;reference:string;reason:string;created_at:string;released_at:string|null;release_reason:string|null}[]};
export type PrivacyQueue={requests:PrivacyRequest[];retained:PrivacyRetained[];retention_runs?:{id:string;status:string;purged_count:number;started_at:string;completed_at:string|null}[]};
export type PublicSeo={path:string;canonical:string;title:string;description:string;indexable:boolean;image?:string};
export type PublicTeacherPage={listing:PublicOffer;catalogue:Catalogue;seo:PublicSeo;redirect_to?:string};
export type PublicCategoryPage={domain:{id:string;label:string};subject:CatalogueTerm;offers:PublicOffer[];catalogue:Catalogue;seo:PublicSeo};
export type PublicHome={offers:PublicOffer[];catalogue:Catalogue;categories:{path:string;domain_id:string;subject_id:string;label:string;domain:string;offers:number}[];seo:PublicSeo};
export type DomainMetrics={id:string;label:string;available_offers:number;available_tutors:number;covered_subjects:number;searches:number;matched_searches:number;empty_searches:number;partial_searches:number;requests:number;responses:number;acceptances:number;declines:number;cancelled:number;connections:number;mature_requests:number;mature_responses:number;mature_connections:number;average_response_ms:number|null;captured_purchases:number;captured_paise:number;unexpected_capture_paise:number;refund_intents:number;confirmed_refunds:number;refunded_paise:number;chargeback_paise:number;mature_paid_purchases:number;mature_matched_purchases:number;mature_refunded_purchases:number;search_result_rate:number|null;mature_response_rate:number|null;mature_connection_rate:number|null;mature_paid_match_rate:number|null;mature_paid_refund_rate:number|null};
export type MarketplaceReport={as_of:string;from:string;to:string;test_only:boolean;currency:'INR';domains:DomainMetrics[];estimated_teaching_outcomes:null;unique_customers:null;definitions:Record<string,string>};

export type OperationsScope='SUPPORT'|'FINANCE';
export type OperationJob={id:string;kind:'NOTIFICATION'|'AUTH_MAIL'|'PAYMENT_EVENT'|'REFUND'|'RECONCILIATION'|'PURCHASE';status:string;attempts:number;created_at:string;updated_at?:string;lease_until?:string|null;recovery:'REPLAY'|'WAIT'|'EXPIRED'|'RECONCILE_PROVIDER'|'MANUAL_RECONCILIATION'};
export type OperationObservation={kind:'WEBHOOK_DELIVERY'|'BACKUP'|'SECURITY';healthy:boolean;observed_at:string;valid_until:string;stale:boolean};
export type OperationsReport={recovery_payment_mode?:'CONFIGURED'|'DISABLED_ISOLATED';recoveries?:{id:string;source_snapshot_at:string;release_id:string;state:'MONEY_REVIEW'|'RELEASED';started_at:string;privacy_reapplied_at:string|null;released_at?:string|null}[];as_of:string;scope:OperationsScope;test_only:boolean;correlation_id:string;checkout:{paused:boolean;revision:number;updated_at?:string};routing:{email:'CONFIGURED'|'CONFIG_REQUIRED';sms:boolean;outside_support_hours:true};alerts:{id:string;code:string;status:'OPEN'|'RESOLVED';scope:OperationsScope;count:number;opened_at:string;last_seen_at?:string;resolved_at?:string|null}[];jobs:OperationJob[];observations:OperationObservation[];replays:{kind:string;target_id:string;status:string;correlation_id:string;created_at:string}[];monitor:{checked_at:string|null};job_limit:number};
export const api = {
  classes:(connection:string)=>request<ClassInvitations>('GET','/v1/me/connections/'+encodeURIComponent(connection)+'/classes'),
  createClass:(connection:string,details:ClassDetails,request_key:string)=>request<{class:ClassInvitation;replayed:boolean}>('POST','/v1/me/connections/'+encodeURIComponent(connection)+'/classes',{...details,request_key}),
  editClass:(connection:string,id:string,details:ClassDetails,revision:number)=>request<{class:ClassInvitation}>('POST','/v1/me/connections/'+encodeURIComponent(connection)+'/classes/'+encodeURIComponent(id),{...details,revision}),
  cancelClass:(connection:string,id:string,revision:number)=>request<{class:ClassInvitation}>('POST','/v1/me/connections/'+encodeURIComponent(connection)+'/classes/'+encodeURIComponent(id)+'/cancellation',{revision}),
  joinClass:(connection:string,id:string)=>request<{url:string}>('POST','/v1/me/connections/'+encodeURIComponent(connection)+'/classes/'+encodeURIComponent(id)+'/join'),
  operations:(scope:OperationsScope,reason:string)=>request<OperationsReport>('GET','/v1/staff/operations?'+new URLSearchParams({scope,reason})),
  releaseRecovery:(body:{recovery_id:string;reconciliation_ids:string[];evidence_reference:string;checked_through:string;provider_checked:true;refunds_checked:true;bank_checked:true;reason:string})=>request<{recovery_released:boolean;correlation_id:string}>('POST','/v1/staff/operations/recovery-releases',body),
  controlCheckout:(body:{request_key:string;revision:number;paused:boolean;reason:string})=>request<{checkout:OperationsReport['checkout'];correlation_id:string}>('POST','/v1/staff/operations/checkout',body),
  replayOperation:(body:{request_key:string;kind:Exclude<OperationJob['kind'],'PURCHASE'>;id:string;reason:string})=>request<{scheduled:boolean;correlation_id:string}>('POST','/v1/staff/operations/replays',body),
  observeOperation:(body:{request_key:string;kind:OperationObservation['kind'];healthy:boolean;observed_at:string;evidence_reference:string;reason:string})=>request<{recorded:boolean;correlation_id:string}>('POST','/v1/staff/operations/observations',body),
  observedSearch:(filters:DiscoveryFilters,request_key:string)=>request<DiscoveryPage>('POST','/v1/discovery/searches',{filters,request_key}),
  marketplaceMetrics:(reason:string,from?:string,to?:string)=>request<MarketplaceReport>('GET','/v1/staff/marketplace-metrics?'+new URLSearchParams({reason,...(from?{from}:{}),...(to?{to}:{})})),
  publicHome:()=>request<PublicHome>('GET','/v1/public/home'),
  publicTeacher:(slug:string)=>request<PublicTeacherPage>('GET','/v1/public/teachers/'+encodeURIComponent(slug)),
  publicCategory:(domain:string,subject:string)=>request<PublicCategoryPage>('GET','/v1/public/categories/'+encodeURIComponent(domain)+'/'+encodeURIComponent(subject)),
  publicSitemap:()=>request<Blob>('GET','/v1/public/sitemap',undefined,true),
  publicRobots:()=>request<Blob>('GET','/v1/public/robots',undefined,true),

  privacyState:()=>request<PrivacyState>('GET','/v1/me/privacy'),
  verifyPrivacy:(password:string,purpose:PrivacyKind|'DOWNLOAD')=>request<{proof:string;expires_at:string}>('POST','/v1/me/privacy/verifications',{password,purpose}),
  requestPrivacy:(body:{request_key:string;kind:PrivacyKind;verification:string;profile_id?:string;confirmation?:'DELETE MY ACCOUNT'})=>request<{request:PrivacyRequest;replayed:boolean}>('POST','/v1/me/privacy/requests',body),
  downloadPrivacy:(id:string,verification:string)=>request<Blob>('POST','/v1/me/privacy/requests/'+encodeURIComponent(id)+'/download',{verification},true),
  forgetPrivacyReceipt:()=>request<void>('DELETE','/v1/me/privacy/receipt'),
  privacyQueue:(scope:StaffScope,reason:string)=>request<PrivacyQueue>('GET','/v1/staff/privacy?'+new URLSearchParams({scope,reason})),
  inspectPrivacyRetained:(id:string,reason:string)=>request<{record:unknown;purpose:string;expires_at:string}>('POST','/v1/staff/privacy/retained/'+encodeURIComponent(id)+'/inspections',{reason}),
  privacyHold:(id:string,body:{operation:'HOLD'|'RELEASE';reason:string;reference?:string;hold_id?:string})=>request<{hold:{id:string}}>('POST','/v1/staff/privacy/retained/'+encodeURIComponent(id)+'/holds',body),
  retryPrivacy:(id:string,reason:string)=>request<{scheduled:true}>('POST','/v1/staff/privacy/requests/'+encodeURIComponent(id)+'/retries',{reason}),
  completePrivacyExternal:(id:string,reason:string,reference:string)=>request<{confirmed:true}>('POST','/v1/staff/privacy/requests/'+encodeURIComponent(id)+'/external-completions',{reason,reference}),

  couponQuote:(code:string)=>request<{quote:CouponQuote}>('POST','/v1/me/coupons/quote',{code}),
  couponHistory:()=>request<{redemptions:CouponRedemption[]}>('GET','/v1/me/coupon-redemptions'),
  cancelCoupon:(id:string)=>request<{redemption:CouponRedemption}>('POST','/v1/me/coupon-redemptions/'+encodeURIComponent(id)+'/cancellation',{}),
  staffCoupons:()=>request<{coupons:CouponCampaign[]}>('GET','/v1/staff/coupons'),
  createCoupon:(input:{code:string;percent_off:number;starts_at:string;expires_at:string;max_uses:number;reason:string})=>request<{coupon:CouponCampaign}>('POST','/v1/staff/coupons',input),
  disableCoupon:(id:string,reason:string)=>request<{coupon:CouponCampaign}>('POST','/v1/staff/coupons/'+encodeURIComponent(id)+'/disable',{reason}),
  paymentPolicy:()=>request<PaymentPolicy>('GET','/v1/payments/policy'),
  currentPurchase:()=>request<{purchase:{id:string}|null}>('GET','/v1/me/purchases/current'),
  purchase:(id:string)=>request<{purchase:Purchase}>('GET','/v1/me/purchases/'+encodeURIComponent(id)),
  createPurchase:(input:{request_key:string;listing_id:string;listing_revision:number;learner_id:string;policy_version:'access-v1';coupon_code?:string})=>request<{purchase:Purchase|null;promotion?:CouponRedemption}>('POST','/v1/me/purchases',input),
  confirmPurchase:(id:string,result:CheckoutConfirmation)=>request<{purchase:Purchase}>('POST','/v1/me/purchases/'+encodeURIComponent(id)+'/confirmation',{razorpay_order_id:result.razorpay_order_id,razorpay_payment_id:result.razorpay_payment_id,razorpay_signature:result.razorpay_signature}),
  safetyContext:(kind:SafetyKind,id:string)=>request<SafetyContext>('GET','/v1/me/'+(kind==='connection'?'connections/':'contact-requests/')+encodeURIComponent(id)+'/safety'),
  blockPeer:(kind:SafetyKind,id:string,blocked:boolean)=>request<SafetyContext>('POST','/v1/me/'+(kind==='connection'?'connections/':'contact-requests/')+encodeURIComponent(id)+'/safety/block',{blocked}),
  reportSafety:(kind:SafetyKind,id:string,input:{request_key:string;category:SafetyCategory;description:string;message_sequences:number[]})=>request<{case:SafetyCase;replayed:boolean}>('POST','/v1/me/'+(kind==='connection'?'connections/':'contact-requests/')+encodeURIComponent(id)+'/safety/reports',input),
  safetyCenter:()=>request<SafetyCenter>('GET','/v1/me/safety'),
  appealSafety:(id:string,input:{request_key:string;description:string})=>request<{appeal:SafetyAppeal;replayed:boolean}>('POST','/v1/me/safety-cases/'+encodeURIComponent(id)+'/appeals',input),
  safetyQueue:()=>request<{cases:SafetyCase[]}>('GET','/v1/staff/safety-cases'),
  inspectSafety:(id:string,reason:string)=>request<{case:SafetyCaseView}>('POST','/v1/staff/safety-cases/'+encodeURIComponent(id)+'/inspections',{reason}),
  safetyAction:(id:string,revision:number,operation:SafetyOperation,reason:string)=>request<{case:SafetyCase;restrictions:SafetyRestriction[]}>('POST','/v1/staff/safety-cases/'+encodeURIComponent(id)+'/actions',{revision,operation,reason}),
  chatHistory:(id:string,query:{after?:number;before?:number;limit?:number}={})=>{const params=new URLSearchParams();for(const [key,value] of Object.entries(query))if(value!==undefined)params.set(key,String(value));return request<ChatState>('GET','/v1/me/connections/'+encodeURIComponent(id)+'/messages'+(params.size?'?'+params.toString():''));},
  sendMessage:(id:string,client_message_id:string,text:string)=>request<{message:ChatMessage;replayed:boolean}>('POST','/v1/me/connections/'+encodeURIComponent(id)+'/messages',{client_message_id,text}),
  readChat:(id:string,sequence:number)=>request<ChatReadState>('POST','/v1/me/connections/'+encodeURIComponent(id)+'/read-position',{sequence}),
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
  listings: () => request<{listings:TeachingListing[];eligible_subject_ids:string[]}>('GET','/v1/me/listings'),
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
  reviewContext:(id:string)=>request<ReviewContext>('GET','/v1/me/connections/'+encodeURIComponent(id)+'/review'),
  submitReview:(id:string,input:{request_key:string;rating:number;text:string;interaction_attested:true;policy_version:'review-v1'})=>request<{review:ReviewRow}>('POST','/v1/me/connections/'+encodeURIComponent(id)+'/review',input),
  supportPolicy:()=>request<SupportPolicy>('GET','/v1/support-policy'),
  supportCases:()=>request<{cases:SupportCase[];policy:SupportPolicy}>('GET','/v1/me/support-cases'),
  supportCase:(id:string)=>request<{case:SupportCase}>('GET','/v1/me/support-cases/'+encodeURIComponent(id)),
  createSupportCase:(input:{request_key:string;category:'ACCOUNT'|'BILLING'|'OTHER';subject:string;description:string})=>request<{case:SupportCase}>('POST','/v1/me/support-cases',input),
  replySupportCase:(id:string,revision:number,message:string)=>request<{case:SupportCase}>('POST','/v1/me/support-cases/'+encodeURIComponent(id)+'/messages',{revision,message}),
  appealRefund:(id:string,request_key:string,description:string)=>request<{case:SupportCase}>('POST','/v1/me/refund-cases/'+encodeURIComponent(id)+'/appeals',{request_key,description}),
  supportQueue:(scope:StaffScope,reason:string)=>request<{cases:SupportCase[]}>('GET','/v1/staff/support-cases?scope='+scope+'&reason='+encodeURIComponent(reason)),
  inspectSupportCase:(id:string,reason:string)=>request<{case:SupportCase}>('POST','/v1/staff/support-cases/'+encodeURIComponent(id)+'/inspections',{reason}),
  actSupportCase:(id:string,input:{revision:number;operation:SupportOperation;reason:string;message?:string})=>request<{case:SupportCase}>('POST','/v1/staff/support-cases/'+encodeURIComponent(id)+'/actions',input),
  ownReviews:()=>request<{reviews:ReviewRow[]}>('GET','/v1/me/reviews'),
  withdrawReview:(id:string,revision:number)=>request<{review:ReviewRow}>('POST','/v1/me/reviews/'+encodeURIComponent(id)+'/withdrawals',{revision}),
  appealReview:(id:string,input:{request_key:string;revision:number;description:string})=>request<{appeal:{id:string;status:string}}>('POST','/v1/me/reviews/'+encodeURIComponent(id)+'/appeals',input),
  publicReviews:(id:string,cursor?:string)=>request<PublicReviewPage>('GET','/v1/discovery/'+encodeURIComponent(id)+'/reviews'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  reviewQueue:(reason:string)=>request<{reviews:ReviewRow[];policy:string}>('GET','/v1/staff/reviews?reason='+encodeURIComponent(reason)),
  inspectReview:(id:string,reason:string)=>request<{review:ReviewRow;decisions:NonNullable<ReviewRow['decisions']>}>('POST','/v1/staff/reviews/'+encodeURIComponent(id)+'/inspections',{reason}),
  moderateReview:(id:string,input:{revision:number;outcome:'PUBLISH'|'REJECT'|'REMOVE';policy_code:string;reason:string})=>request<{review:ReviewRow}>('POST','/v1/staff/reviews/'+encodeURIComponent(id)+'/decisions',input),
  notifications:()=>request<NotificationHistory>('GET','/v1/me/notifications'),
  notificationPreferences:()=>request<NotificationPreferenceView>('GET','/v1/me/notification-preferences'),
  saveNotificationPreferences:(input:NotificationPreferences)=>request<NotificationPreferenceView>('POST','/v1/me/notification-preferences',input),
  notificationQueue:(reason:string)=>request<NotificationQueue>('GET','/v1/staff/notifications?reason='+encodeURIComponent(reason)),
  retryNotification:(id:string,reason:string)=>request<{scheduled:boolean}>('POST','/v1/staff/notifications/'+encodeURIComponent(id)+'/retries',{reason}),
  reconcileNotification:(id:string,provider_reference:string,reason:string)=>request<{reconciled:boolean}>('POST','/v1/staff/notifications/'+encodeURIComponent(id)+'/provider-confirmations',{provider_reference,reason}),
  paymentHistory: (cursor?:string) => request<{purchases:PaymentHistoryRow[];next_cursor:string|null}>('GET','/v1/me/payment-history'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  paymentReceipt: (id:string) => request<{document:PaymentDocument}>('GET','/v1/me/purchases/'+encodeURIComponent(id)+'/receipt'),
  confirmCaptureEvidence: (id:string,input:{provider_payment_id:string;captured_at:string;reason:string}) => request<{recorded:boolean}>('POST','/v1/staff/finance/purchases/'+encodeURIComponent(id)+'/capture-confirmations',input),
  reconciliation: (reason:string) => request<ReconciliationView>('GET','/v1/staff/finance/reconciliation?reason='+encodeURIComponent(reason)),
  startReconciliation: (input:{request_key:string;year:number;month:number;reason:string}) => request<{run:{id:string;status:string}}>('POST','/v1/staff/finance/reconciliation-runs',input),
  retryReconciliation: (id:string,reason:string) => request<{scheduled:boolean}>('POST','/v1/staff/finance/reconciliation-runs/'+encodeURIComponent(id)+'/retries',{reason}),
  importBankReceipts: (input:{reason:string;rows:{reference:string;utr:string;amount_paise:number;currency:'INR';received_at:string}[]}) => request<{recorded:number;conflicts:number}>('POST','/v1/staff/finance/bank-receipts',input),
  resolveFinanceException: (id:string,reason:string) => request<{resolved:boolean}>('POST','/v1/staff/finance/exceptions/'+encodeURIComponent(id)+'/resolutions',{reason}),
  refundCases: (id:string) => request<{cases:RefundCase[]}>('GET','/v1/me/purchases/'+encodeURIComponent(id)+'/refund-cases'),
  createRefundCase: (id:string,request_key:string,reason:string) => request<{case:RefundCase}>('POST','/v1/me/purchases/'+encodeURIComponent(id)+'/refund-cases',{request_key,reason}),
  financeCases: (reason:string) => request<{cases:RefundCase[];exceptions:{id:string;kind:string;reference:string;status:string}[]}>('GET','/v1/staff/refund-cases?reason='+encodeURIComponent(reason)),
  reviewRefundCase: (id:string,input:{outcome:'APPROVE';amount_paise:number;access_treatment:'KEEP'|'REVOKE_FUTURE';reason:string}|{outcome:'DECLINE';reason:string}) => request<{case:RefundCase}>('POST','/v1/staff/refund-cases/'+encodeURIComponent(id)+'/decisions',input),
  refunds: (id:string) => request<RefundState>('GET','/v1/me/purchases/'+encodeURIComponent(id)+'/refunds'),
  cancelPurchase: (id:string) => request<RefundState>('POST','/v1/me/purchases/'+encodeURIComponent(id)+'/cancellations',{}),
  refundQueue: (reason:string) => request<{refunds:(RefundOperation&{cycle_id:string})[];reserves:{provider_key_id:string;currency:string;confirmed_paise:string;reserved_paise:string;spent_paise:string}[]}>('GET','/v1/staff/refunds?reason='+encodeURIComponent(reason)),
  fundRefundReserve: (input:{reference:string;amount_paise:number;reason:string}) => request<{recorded:boolean}>('POST','/v1/staff/refund-reserve/funding',input),
  retryRefund: (id:string,reason:string) => request<{scheduled:boolean}>('POST','/v1/staff/refunds/'+encodeURIComponent(id)+'/retries',{reason}),
  tutorRequests: (cursor?:string) => request<{requests:IncomingRequest[];next_cursor:string|null}>('GET','/v1/me/tutor-requests'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  decideRequest: (id:string,decision:'ACCEPT'|'DECLINE') => request<{request_id:string;status:'ACCEPTED'|'DECLINED';connection_id:string|null;connection_status:'ACTIVE'|'PENDING_GRANT'|null;replayed:boolean}>('POST','/v1/me/tutor-requests/'+encodeURIComponent(id)+'/decisions',{decision}),
  connections: (cursor?:string) => request<{connections:ConnectionSummary[];next_cursor:string|null}>('GET','/v1/me/connections'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  connection: (id:string) => request<{connection:ConnectionDetail}>('GET','/v1/me/connections/'+encodeURIComponent(id)),
  connectionContacts: (id:string) => request<{peer:ConnectionPeer}>('GET','/v1/me/connections/'+encodeURIComponent(id)+'/contacts'),
  requestAccess: () => request<RequestAccess>('GET','/v1/me/request-access'),
  sendContactRequest: (input:ContactRequestInput) => request<{request:ContactRequest;replayed:boolean}>('POST','/v1/me/contact-requests',input),
  contactRequests: (cursor?:string) => request<{requests:ContactRequest[];next_cursor:string|null}>('GET','/v1/me/contact-requests'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  requestAlternatives: (id:string,cursor?:string) => request<{offers:PublicOffer[];next_cursor:string|null}>('GET','/v1/me/contact-requests/'+encodeURIComponent(id)+'/alternatives'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),
  contactRequest: (id:string) => request<{request:ContactRequest}>('GET','/v1/me/contact-requests/'+encodeURIComponent(id)),
  me: () => request<{ user: User }>("GET", "/v1/me"),
  recoveryEmail: (email:string) => request<CodeMessage>('POST','/v1/auth/recovery-emails',{email}),
  resetPassword: (token:string,password:string) => request<CodeMessage>('POST','/v1/auth/password-resets',{token,password}),
  changeRoles: (roles:User['roles']) => request<{user:User}>('POST','/v1/me/roles',{roles}),
  sessions: () => request<{sessions:AccountSession[]}>('GET','/v1/auth/sessions'),
  revokeSession: (id:string) => request<void>('DELETE','/v1/auth/sessions/by-id/'+encodeURIComponent(id)),
  revokeOthers: () => request<void>('DELETE','/v1/auth/sessions/others'),
  adminOverview:(days:number)=>request<AdminOverview>('GET','/v1/staff/admin/overview?days='+days),
  adminAccounts:(query:string,cursor?:string)=>request<{accounts:AdminAccount[];next_cursor:string|null}>('POST','/v1/staff/admin/accounts/search',{query,...(cursor?{cursor}:{})}),
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
