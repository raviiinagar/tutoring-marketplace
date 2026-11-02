import {RefundsService} from '../src/refunds.js';
import {personalExport} from '../src/privacy-inventory.js';
import { PaymentEvents } from "../src/payment-events.js";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApplication } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import { Database, migrate } from "../src/database.js";
import { decrypt } from "../src/security.js";
import { assignStaff, type StaffScope } from "../src/staff.js";
import { totp } from "../src/totp.js";
// @ts-expect-error Local JavaScript helper has no declaration.
import { startDatabase } from "../../../scripts/postgres.mjs";

let app: INestApplication;
let database: Database;
let config: Config;
let cluster: Awaited<ReturnType<typeof startDatabase>>;
let clock = new Date();
const now = () => clock;
const origin = "http://localhost:3000";
const password = "Staff-password-321!";
const post = (path: string, body: unknown, cookie?: string) => {
  const call = request(app.getHttpServer())
    .post(path)
    .set("Origin", origin)
    .send(body);
  return cookie ? call.set("Cookie", cookie) : call;
};
const get = (path: string, cookie?: string) => {
  const call = request(app.getHttpServer()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};
const combine = (base: string, staff: string) =>
  base.split(";")[0] + "; " + staff.split(";")[0];
before(async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const directory = resolve(".local/tests", randomUUID());
  config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: `postgres://test_user:${randomBytes(24).toString("hex")}@127.0.0.1:${port}/tutor_simple_test`,
    AUTH_SECRET: randomBytes(48).toString("hex"),
    WEB_ORIGIN: origin,
    MAIL_TRANSPORT: "capture",
    DEV_MAIL_DIR: join(directory, "mail"),
    EVIDENCE_SCANNER: "test",
    GUARDIAN_VERIFICATION_MODE: "test",
    PAYMENT_MODE: "razorpay_test",
    RAZORPAY_KEY_ID: "rzp_test_fixture",
    RAZORPAY_KEY_SECRET: "fictional-provider-key-secret-321",
    RAZORPAY_WEBHOOK_SECRET: "fictional-webhook-key-secret-321",
  });
  cluster = await startDatabase(
    config.databaseUrl,
    join(directory, "postgres"),
  );
  database = new Database(config.databaseUrl);
  await migrate(database);
  app = await createApplication(
    config,
    database,
    now,
    undefined,
    undefined,
    gateway,
  );
});
beforeEach(() => {
  clock = new Date(clock.getTime() + 8 * 86400000);
  gateway.loseCreate = false;
  gateway.unavailable = false;
  gateway.onCreate = undefined;
});
after(async () => {
  await app?.close();
  await database?.close();
  await cluster?.stop();
});
async function fixture(scopes: StaffScope[] | null = ["SUPPORT"]) {
  const email = randomUUID() + "@example.test";
  await post("/v1/auth/registrations", {
    display_name: "Test operator",
    email,
    password,
  }).expect(202);
  const row = (
    await database.pool.query(
      "SELECT encrypted_payload FROM mail_outbox WHERE user_id=(SELECT id FROM users WHERE email=$1)",
      [email],
    )
  ).rows[0];
  await post("/v1/auth/verifications", {
    token: new URL(
      decrypt<{ verification_url: string }>(
        row.encrypted_payload,
        config.authSecret,
      ).verification_url,
    ).hash.slice(7),
  }).expect(200);
  const login = await post("/v1/auth/sessions", { email, password }).expect(
    200,
  );
  if (scopes)
    await assignStaff(
      database,
      email,
      scopes,
      "Fixture staff bootstrap",
      "test operator",
    );
  return {
    email,
    id: login.body.user.id,
    cookie: login.headers["set-cookie"][0] as string,
  };
}
async function enroll(cookie: string) {
  const setup = await post(
    "/v1/staff/mfa/enrollments",
    { password },
    cookie,
  ).expect(200);
  const secret = setup.body.secret;
  const confirmed = await post(
    "/v1/staff/mfa/confirmations",
    { code: totp(secret, clock) },
    cookie,
  ).expect(200);
  return {
    secret,
    codes: confirmed.body.recovery_codes as string[],
    staffCookie: confirmed.headers["set-cookie"][0] as string,
    cookie: combine(cookie, confirmed.headers["set-cookie"][0]),
  };
}
const offer = {
  title: "Physics with worked examples",
  description:
    "School physics explained patiently with examples and structured practice.",
  domain_id: "school",
  subject_id: "subject-physics",
  level_id: "level-class-10",
  curriculum_id: "curriculum-cbse",
  language_ids: ["language-english"],
  currency: "INR",
  teaching_mode: "ONLINE",
  rate_paise: 50000,
  rate_unit: "HOUR",
  trial_kind: "NONE",
};
async function publish(user:{cookie:string;reviewer:{cookie:string}}){let row=(await post('/v1/me/listings',offer,user.cookie).expect(201)).body.listing;row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},user.cookie).expect(200)).body.listing;return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Exact fictional Physics teaching offer checked'},user.reviewer.cookie).expect(200)).body.listing;}
class ProviderFixture {
  orders = new Map<string, any>();
  payments = new Map<string, any>();
  loseCreate = false;
  unavailable = false;
  onCreate?: (order: any) => Promise<void>;
  async createOrder(cycle: string, amount: number, currency: string) {
    const row = {
      id: "order_" + randomBytes(8).toString("hex"),
      entity: "order",
      amount,
      currency,
      receipt: cycle,
      notes: { cycle_id: cycle },
      status: "created",
    };
    this.orders.set(row.id, row);
    await this.onCreate?.(row);
    if (this.loseCreate)
      throw new Error("Lost response after provider success");
    return row;
  }
  async fetchOrder(id: string) {
    if (this.unavailable) throw new Error("Provider unavailable");
    return this.orders.get(id);
  }
  async fetchPayment(id: string) {
    if (this.unavailable) throw new Error("Provider unavailable");
    return this.payments.get(id);
  }
}
const gateway = new ProviderFixture();
async function campaign(percent = 100, maxUses = 100, product="LEARNER_ACCESS") {
  const operator = await fixture(["FINANCE"]);
  const mfa = await enroll(operator.cookie);
  const input = {
    code: "SAVE" + randomBytes(6).toString("hex").toUpperCase(),
    percent_off: percent,product,
    max_uses: maxUses,
    starts_at: clock.toISOString(),
    expires_at: new Date(clock.getTime() + 86400000).toISOString(),
    reason: "Fictional coupon campaign for acceptance testing",
  };
  const r = await post("/v1/staff/coupons", input, mfa.cookie).expect(201);
  return { operator, mfa, input, row: r.body.coupon };
}
const intro={display_name:'Fictional Tutor',biography:'I explain physics through practical examples and have experience helping adult learners.',subject_ids:['subject-physics'],hourly_rate_paise:50000,identity_country:'IN',identity_document:'AADHAAR',adult_confirmed:true,public_email_consent:false};
async function shortTutor(){const user=await fixture(null);const r=await post('/v1/me/tutor/introduction',intro,user.cookie).expect(200);const id=r.body.profile.public_id;const submitted=await post('/v1/me/tutor/identity',{media_type:'application/pdf',data:Buffer.from('%PDF-1.4\n% FICTIONAL-TUTOR-EVIDENCE\n%%EOF\n').toString('base64')},user.cookie).expect(200);assert.equal(submitted.body.claims.length,1);assert.equal(submitted.body.profile.status,'SUBMITTED');const reviewer=await fixture(['TRUST']);const mfa=await enroll(reviewer.cookie);await post('/v1/staff/tutor-claims/'+submitted.body.claims[0].id+'/reviews',{outcome:'APPROVE',checked_item:'Fictional adult identity document checked',reason:'Fictional adult identity review approved',adult_identity_confirmed:true,expires_at:new Date(clock.getTime()+365*86400000).toISOString()},mfa.cookie).expect(200);return {...user,publicId:id,reviewer:mfa};}
const pro=(user:any,code?:string,key=randomUUID())=>post('/v1/me/tutor/pro/purchases',{request_key:key,policy_version:'tutor-pro-v1',...(code?{coupon_code:code}:{})},user.cookie);

const place={city:'Presence Test City',area:'North Learning Area',country:'India'};
const presence={expected_revision:0,location:place,teaching_modes:['ONLINE','IN_PERSON'],accepting_students:true,weekly_slots:[{day:'MON',start_minute:960,end_minute:1080}],timezone:'Asia/Kolkata'};
async function offlineOffer(teacher:Awaited<ReturnType<typeof shortTutor>>){let row=(await post('/v1/me/listings',{...offer,teaching_mode:'IN_PERSON'},teacher.cookie).expect(201)).body.listing;row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},teacher.cookie).expect(200)).body.listing;return (await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Coarse city and exact in-person teaching terms reviewed'},teacher.reviewer.cookie).expect(200)).body.listing;}
test('one private identity makes a free public profile; Pro, approved offer and consent independently control public email',async()=>{
 const teacher=await shortTutor();const getProfile=()=>get('/v1/tutor-profiles/'+teacher.publicId);
 const free=(await getProfile().expect(200)).body.profile;assert.equal(free.contact,null);assert.equal(free.offers.length,0);assert.match(free.expertise_label,/self-declared/);const raw=JSON.stringify(free);for(const forbidden of ['birth_date','evidence_id','identity_document',teacher.email,teacher.id])assert.ok(!raw.includes(forbidden),forbidden);
 await post('/v1/me/listings',offer,teacher.cookie).expect(403);
 const learnerCode=await campaign();await pro(teacher,learnerCode.input.code).expect(409);
 const c=await campaign(100,100,'TUTOR_PRO');await post('/v1/me/coupons/quote',{code:c.input.code},teacher.cookie).expect(409);const quote=await post('/v1/me/coupons/quote',{code:c.input.code,product:'TUTOR_PRO'},teacher.cookie).expect(200);assert.equal(quote.body.quote.base_paise,60000);
 const before=gateway.orders.size,key=randomUUID();const replies=await Promise.all([pro(teacher,c.input.code,key).expect(200),pro(teacher,c.input.code,key).expect(200)]);assert.equal(replies[0].body.promotion.id,replies[1].body.promotion.id);assert.equal(replies[0].body.promotion.access.status,'ACTIVE');assert.equal(gateway.orders.size,before);assert.equal((await database.pool.query('SELECT count(*)::int n FROM access_entitlements WHERE payer_id=$1',[teacher.id])).rows[0].n,0);assert.equal((await get('/v1/me/purchases/current',teacher.cookie)).body.purchase,null);
 const listing=await publish(teacher);assert.equal(listing.eligible,true);assert.equal((await getProfile()).body.profile.contact,null);
 const state=(await get('/v1/me/tutor',teacher.cookie)).body;await post('/v1/me/tutor/introduction',{...intro,public_email_consent:true,expected_public_revision:state.profile.public_revision},teacher.cookie).expect(200);const contact=(await getProfile().expect(200)).body.profile;assert.equal(contact.contact.email,teacher.email);assert.equal(contact.offers.length,1);assert.equal((await get('/v1/discovery/'+listing.id).expect(200)).body.listing.evidence_labels.length,1);
 const updated=(await get('/v1/me/tutor',teacher.cookie)).body;assert.equal(updated.profile.revision,state.profile.revision);await post('/v1/me/tutor/introduction',{...intro,public_email_consent:false,expected_public_revision:updated.profile.public_revision},teacher.cookie).expect(200);assert.equal((await getProfile()).body.profile.contact,null);
 clock=new Date(clock.getTime()+30*86400000);assert.equal((await getProfile().expect(200)).body.profile.offers.length,0);await get('/v1/discovery/'+listing.id).expect(404);
});
test('Tutor Pro server capture uses INR 600, activates once on confirmation, and has no learner matching deadline',async()=>{
 const teacher=await shortTutor();const reserved=await pro(teacher).expect(200),p=reserved.body.purchase;assert.equal(p.product,'TUTOR_PRO');assert.equal(p.checkout.amount,60000);assert.equal(p.matching_deadline,null);const order=gateway.orders.get(p.checkout.order_id);const payment={id:'pay_'+randomBytes(8).toString('hex'),entity:'payment',order_id:order.id,amount:60000,currency:'INR',status:'captured',captured:true,created_at:Math.floor(clock.getTime()/1000)};gateway.payments.set(payment.id,payment);const event={event:'payment.captured',created_at:payment.created_at,payload:{payment:{entity:payment}}};const events=new PaymentEvents(database,config,gateway,now);const body=Buffer.from(JSON.stringify(event)),signature=createHmac('sha256',config.payments!.webhookSecret).update(body).digest('hex');await events.ingest(body,'evt_'+randomBytes(10).toString('hex'),signature);await events.tick();const view=(await get('/v1/me/purchases/'+p.id,teacher.cookie).expect(200)).body.purchase;assert.equal(view.access.status,'ACTIVE');assert.equal(view.matching_deadline,null);assert.equal(new Date(view.access.ends_at).getTime()-new Date(view.access.starts_at).getTime(),30*86400000);await events.tick();assert.equal((await database.pool.query('SELECT count(*)::int n FROM tutor_pro_grants WHERE cycle_id=$1',[p.id])).rows[0].n,1);assert.equal((await get('/v1/me/purchases/current',teacher.cookie)).body.purchase,null);assert.equal((await database.pool.query('SELECT count(*)::int n FROM access_entitlements WHERE payer_id=$1',[teacher.id])).rows[0].n,0);
 clock=new Date(clock.getTime()+4*86400000);assert.equal((await get('/v1/me/tutor/pro',teacher.cookie)).body.active!==null,true);
 await app.get(RefundsService).tick();assert.equal((await database.pool.query('SELECT count(*)::int n FROM purchase_cancellations WHERE cycle_id=$1',[p.id])).rows[0].n,0);
 await post('/v1/me/purchases/'+p.id+'/cancellations',{},teacher.cookie).expect(409);
 const refundCase=await post('/v1/me/purchases/'+p.id+'/refund-cases',{request_key:randomUUID(),reason:'Fictional service-failure refund review for Tutor Pro'},teacher.cookie).expect(201);
 const finance=await fixture(['FINANCE']),mfa=await enroll(finance.cookie);
 await post('/v1/staff/refund-cases/'+refundCase.body.case.id+'/decisions',{outcome:'APPROVE',amount_paise:60000,access_treatment:'REVOKE_FUTURE',reason:'Approve full fictional Tutor Pro service-failure refund'},mfa.cookie).expect(200);
 assert.equal((await get('/v1/me/tutor/pro',teacher.cookie)).body.active,null);assert.equal((await database.pool.query('SELECT status FROM tutor_pro_grants WHERE cycle_id=$1',[p.id])).rows[0].status,'REVOKED');

});
test('identity edits require new approval; foreign identity requires passport; public restriction removes introduction',async()=>{
 const u=await fixture(null);await post('/v1/me/tutor/introduction',{...intro,identity_country:'OTHER'},u.cookie).expect(400);await post('/v1/me/tutor/introduction',{...intro,biography:'Reach me at private@example.test for your private classes.'},u.cookie).expect(400);
 const teacher=await shortTutor();await post('/v1/me/tutor/introduction',{...intro,display_name:'Changed identity name',expected_public_revision:1},teacher.cookie).expect(200);await get('/v1/tutor-profiles/'+teacher.publicId).expect(404);await pro(teacher).expect(403);
 const another=await shortTutor();await database.pool.query("UPDATE users SET status='DISABLED' WHERE id=$1",[another.id]);await get('/v1/tutor-profiles/'+another.publicId).expect(404);
});

test('a valid submitted enquiry survives ordinary Tutor Pro expiry while new supply and public contact disappear',async()=>{
 const teacher=await shortTutor(),c=await campaign(100,100,'TUTOR_PRO');await pro(teacher,c.input.code).expect(200);const listing=await publish(teacher),otherListing=await publish(teacher);
 clock=new Date(clock.getTime()+30*86400000-3600000);const owner=await fixture(null);const learner=(await post('/v1/me/learners/adult',{alias:'Fictional learner',learning_requirements:'Physics worked examples for adult learning',adult_confirmed:true},owner.cookie).expect(201)).body.profile;
 const learnerCode=await campaign();await post('/v1/me/purchases',{request_key:randomUUID(),listing_id:listing.id,listing_revision:listing.revision,learner_id:learner.id,policy_version:'access-v1',coupon_code:learnerCode.input.code},owner.cookie).expect(200);
 const req=(await post('/v1/me/contact-requests',{request_key:randomUUID(),listing_id:listing.id,listing_revision:listing.revision,learner_id:learner.id,subject_id:'subject-physics',teaching_mode:'ONLINE',learning_requirements:'Fictional Physics enquiry before Tutor Pro expiry',preferred_times:'Weekday evening, IST'},owner.cookie).expect(200)).body.request;
 const second=(await post('/v1/me/contact-requests',{request_key:randomUUID(),listing_id:otherListing.id,listing_revision:otherListing.revision,learner_id:learner.id,subject_id:'subject-physics',teaching_mode:'ONLINE',learning_requirements:'Second fictional Physics enquiry before Tutor Pro expiry',preferred_times:'Weekday evening, IST'},owner.cookie).expect(200)).body.request;
 clock=new Date(clock.getTime()+2*3600000);teacher.cookie=(await post('/v1/auth/sessions',{email:teacher.email,password}).expect(200)).headers['set-cookie'][0];await get('/v1/discovery/'+listing.id).expect(404);const accepted=await post('/v1/me/tutor-requests/'+req.id+'/decisions',{decision:'ACCEPT'},teacher.cookie).expect(200);await get('/v1/me/connections/'+accepted.body.connection_id+'/contacts',owner.cookie).expect(200);await database.pool.query("UPDATE tutor_pro_grants SET status='REVOKED' WHERE payer_id=$1",[teacher.id]);await post('/v1/me/tutor-requests/'+second.id+'/decisions',{decision:'ACCEPT'},teacher.cookie).expect(403);await get('/v1/me/connections/'+accepted.body.connection_id+'/contacts',owner.cookie).expect(200);
});

test('location and hours validate ownership, stale writes and public Subject/city/day/time filters without re-reviewing identity',async()=>{
 const teacher=await shortTutor();await post('/v1/me/tutor/presence',presence).expect(401);
 await post('/v1/me/tutor/presence',{...presence,location:null},teacher.cookie).expect(400);
 await post('/v1/me/tutor/presence',{...presence,location:{...place,address:'Private house'}},teacher.cookie).expect(400);
 await post('/v1/me/tutor/presence',{...presence,weekly_slots:[...presence.weekly_slots,{day:'MON',start_minute:1000,end_minute:1100}]},teacher.cookie).expect(400);
 await post('/v1/me/tutor/presence',{...presence,timezone:'Europe/London'},teacher.cookie).expect(400);
 const replies=await Promise.all([post('/v1/me/tutor/presence',presence,teacher.cookie),post('/v1/me/tutor/presence',presence,teacher.cookie)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 const own=(await get('/v1/me/tutor',teacher.cookie).expect(200)).body.profile;assert.equal(own.status,'APPROVED');assert.equal(own.revision,1);
 const pub=(await get('/v1/tutor-profiles/'+teacher.publicId).expect(200)).body.profile;assert.deepEqual(pub.presence.location,place);assert.equal(pub.presence.weekly_slots.length,1);assert.equal(pub.offers.length,0);
 const prefix='/v1/tutor-profiles?subject_id=subject-physics&location='+encodeURIComponent(place.city)+'&teaching_mode=IN_PERSON';
 const found=(await get(prefix+'&day=MON&at_time=1020').expect(200)).body.profiles;assert.ok(found.some((p:any)=>p.id===teacher.publicId));
 for(const filter of ['&day=TUE','&day=MON&at_time=1080'])assert.ok(!(await get(prefix+filter).expect(200)).body.profiles.some((p:any)=>p.id===teacher.publicId));
 assert.ok(!(await get('/v1/tutor-profiles?location=NoSuchCity').expect(200)).body.profiles.some((p:any)=>p.id===teacher.publicId));
 await get('/v1/tutor-profiles?at_time=600').expect(400);await get('/v1/discovery?at_time=600').expect(400);
 const locations=(await get('/v1/tutor-profiles/locations?q='+encodeURIComponent(place.city)).expect(200)).body.locations;assert.ok(locations.some((p:any)=>p.city===place.city));assert.ok(!JSON.stringify(locations).includes(teacher.id));
 const exported=await database.transaction(async c=>personalExport(c,(await c.query('SELECT * FROM users WHERE id=$1',[teacher.id])).rows[0],config,clock));assert.equal(exported.tutor_presence[0].location.city,place.city);
 const other=await fixture(null);assert.equal((await get('/v1/me/tutor/presence',other.cookie).expect(200)).body.presence.revision,0);
});

test('in-person offers and enquiries use real location/mode while closing new students preserves an existing enquiry',async()=>{
 const teacher=await shortTutor(),c=await campaign(100,100,'TUTOR_PRO');await pro(teacher,c.input.code).expect(200);
 await post('/v1/me/listings',{...offer,teaching_mode:'IN_PERSON'},teacher.cookie).expect(409);
 await post('/v1/me/tutor/presence',presence,teacher.cookie).expect(200);const listing=await offlineOffer(teacher);
 const detail=(await get('/v1/discovery/'+listing.id).expect(200)).body.listing;assert.equal(detail.offer.teaching_mode,'IN_PERSON');assert.equal(detail.offer.class_location.city,place.city);
 const query='/v1/discovery?location='+encodeURIComponent(place.city)+'&day=MON&at_time=1020&teaching_mode=IN_PERSON';assert.ok((await get(query).expect(200)).body.offers.some((l:any)=>l.id===listing.id));assert.ok(!(await get('/v1/discovery?teaching_mode=ONLINE').expect(200)).body.offers.some((l:any)=>l.id===listing.id));
 const owner=await fixture(null),learner=(await post('/v1/me/learners/adult',{alias:'Fictional adult learner',learning_requirements:'Learn school Physics with worked examples',adult_confirmed:true},owner.cookie).expect(201)).body.profile;
 const coupon=await campaign();await post('/v1/me/purchases',{request_key:randomUUID(),listing_id:listing.id,listing_revision:listing.revision,learner_id:learner.id,policy_version:'access-v1',coupon_code:coupon.input.code},owner.cookie).expect(200);
 const body={request_key:randomUUID(),listing_id:listing.id,listing_revision:listing.revision,learner_id:learner.id,subject_id:'subject-physics',teaching_mode:'IN_PERSON',learning_requirements:'Fictional in-person Physics teaching enquiry',preferred_times:'Monday 5 pm IST, coarse public area'};
 await post('/v1/me/contact-requests',{...body,teaching_mode:'ONLINE'},owner.cookie).expect(400);
 const req=(await post('/v1/me/contact-requests',body,owner.cookie).expect(200)).body.request;
 assert.equal((await database.pool.query('SELECT offer_snapshot FROM contact_requests WHERE id=$1',[req.id])).rows[0].offer_snapshot.class_location.city,place.city);
 const paused=await post('/v1/me/tutor/presence',{...presence,expected_revision:1,accepting_students:false},teacher.cookie).expect(200);assert.equal(paused.body.offers_need_review,0);
 await get('/v1/discovery/'+listing.id).expect(404);assert.equal((await get('/v1/tutor-profiles/'+teacher.publicId).expect(200)).body.profile.presence.accepting_students,false);
 assert.ok(!(await get('/v1/tutor-profiles?accepting_only=true').expect(200)).body.profiles.some((p:any)=>p.id===teacher.publicId));
 await post('/v1/me/contact-requests',{...body,request_key:randomUUID()},owner.cookie).expect(404);
 await post('/v1/me/tutor-requests/'+req.id+'/decisions',{decision:'ACCEPT'},teacher.cookie).expect(200);
});

test('material location changes require offer resubmission, not new identity evidence',async()=>{
 const teacher=await shortTutor(),coupon=await campaign(100,100,'TUTOR_PRO');await pro(teacher,coupon.input.code).expect(200);await post('/v1/me/tutor/presence',presence,teacher.cookie).expect(200);
 const listing=await offlineOffer(teacher);
 const changed=await post('/v1/me/tutor/presence',{...presence,expected_revision:1,location:{...place,city:'Another Teaching City'}},teacher.cookie).expect(200);assert.equal(changed.body.offers_need_review,1);
 await get('/v1/discovery/'+listing.id).expect(404);const own=(await get('/v1/me/listings',teacher.cookie).expect(200)).body.listings.find((l:any)=>l.id===listing.id);assert.equal(own.status,'CHANGES_REQUESTED');assert.ok(own.revision>listing.revision);
 assert.equal((await get('/v1/me/tutor',teacher.cookie)).body.profile.status,'APPROVED');
 const submitted=(await post('/v1/me/listings/'+listing.id+'/actions/SUBMIT',{revision:own.revision},teacher.cookie).expect(200)).body.listing;
 await post('/v1/staff/listings/'+listing.id+'/reviews',{revision:submitted.revision,outcome:'APPROVE',reason:'Updated city and unchanged in-person offer reviewed'},teacher.reviewer.cookie).expect(200);
 assert.equal((await get('/v1/discovery/'+listing.id).expect(200)).body.listing.class_location.city,'Another Teaching City');
});

test('Saved Tutors are private, authenticated, idempotent and recheck current eligibility and blocks',async()=>{
 const teacher=await shortTutor(),owner=await fixture(null),other=await fixture(null),path='/v1/me/saved-tutors/'+teacher.publicId;
 await get('/v1/me/saved-tutors').expect(401);await post(path,{}).expect(401);await post(path,{owner_id:other.id},owner.cookie).expect(400);
 const saved=await Promise.all([post(path,{},owner.cookie),post(path,{},owner.cookie)]);assert.deepEqual(saved.map(r=>r.status),[200,200]);
 let list=(await get('/v1/me/saved-tutors',owner.cookie).expect(200)).body;assert.equal(list.items.length,1);assert.equal(list.limit,50);assert.equal(list.items[0].profile.id,teacher.publicId);assert.equal(list.items[0].profile.contact,null);assert.equal(list.items[0].profile.evidence,undefined);
 assert.equal((await get('/v1/me/saved-tutors',other.cookie).expect(200)).body.items.length,0);
 await request(app.getHttpServer()).delete(path).set('Origin',origin).set('Cookie',other.cookie).send({}).expect(200);assert.equal((await get('/v1/me/saved-tutors',owner.cookie)).body.items.length,1);
 await request(app.getHttpServer()).post(path).set('Cookie',owner.cookie).send({}).expect(403);
 const exported=await database.transaction(async c=>personalExport(c,(await c.query('SELECT * FROM users WHERE id=$1',[owner.id])).rows[0],config,clock));assert.equal(exported.saved_tutors[0].profile_id,teacher.publicId);assert.equal(exported.saved_tutors[0].profile,undefined);
 await database.pool.query('INSERT INTO account_blocks(owner_id,blocked_id) VALUES($1,$2)',[teacher.id,owner.id]);list=(await get('/v1/me/saved-tutors',owner.cookie)).body;assert.equal(list.items[0].profile,null);await post(path,{},owner.cookie).expect(404);
 await database.pool.query('DELETE FROM account_blocks WHERE owner_id=$1',[teacher.id]);await database.pool.query("UPDATE tutor_profiles SET status='REVOKED' WHERE user_id=$1",[teacher.id]);assert.equal((await get('/v1/me/saved-tutors',owner.cookie)).body.items[0].profile,null);
 await request(app.getHttpServer()).delete(path).set('Origin',origin).set('Cookie',owner.cookie).send({}).expect(200);await request(app.getHttpServer()).delete(path).set('Origin',origin).set('Cookie',owner.cookie).send({}).expect(200);assert.equal((await get('/v1/me/saved-tutors',owner.cookie)).body.items.length,0);
});

test('Saved Tutors enforce the account limit across concurrent additions without losing existing saves',async()=>{
 const teacher=await shortTutor(),otherTeacher=await shortTutor(),owner=await fixture(null);
 // Fictional unavailable profiles represent old saves whose approval has since lapsed.
 await database.transaction(async c=>{for(let n=0;n<49;n++){const id=randomUUID();await c.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,'Fictional expired Tutor','not-a-login-hash')",[id,id+'@example.invalid']);const p=(await c.query("INSERT INTO tutor_profiles(user_id,display_name,biography,encrypted_birth_date) VALUES($1,'Fictional expired Tutor','Fictional unavailable profile','{}') RETURNING public_id",[id])).rows[0];await c.query('INSERT INTO saved_tutors(owner_id,profile_id) VALUES($1,$2)',[owner.id,p.public_id]);}});
 const replies=await Promise.all([post('/v1/me/saved-tutors/'+teacher.publicId,{},owner.cookie),post('/v1/me/saved-tutors/'+otherTeacher.publicId,{},owner.cookie)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);const existing=[teacher,otherTeacher][replies[0].status===200?0:1];await post('/v1/me/saved-tutors/'+existing.publicId,{},owner.cookie).expect(200);assert.equal((await get('/v1/me/saved-tutors',owner.cookie)).body.items.length,50);
});

test('free first-class filters and unit-safe price ordering paginate ties and survive cursor-offer removal',async()=>{
 const teacher=await shortTutor(),coupon=await campaign(100,100,'TUTOR_PRO');await pro(teacher,coupon.input.code).expect(200);const ids:string[]=[];
 for(const [rate,trial] of [[30000,'FREE'],[30000,'FREE'],[50000,'NONE'],[20000,'FREE']] as const){let row=(await post('/v1/me/listings',{...offer,rate_paise:rate,trial_kind:trial,...trial==='FREE'?{trial_minutes:30}:{}},teacher.cookie).expect(201)).body.listing;row=(await post('/v1/me/listings/'+row.id+'/actions/SUBMIT',{revision:row.revision},teacher.cookie).expect(200)).body.listing;await post('/v1/staff/listings/'+row.id+'/reviews',{revision:row.revision,outcome:'APPROVE',reason:'Fictional price and optional free trial terms checked'},teacher.reviewer.cookie).expect(200);ids.push(row.id);}
 const uniqueCity='Sorted Trial City '+randomUUID().slice(0,8);await post('/v1/me/tutor/presence',{...presence,location:{city:uniqueCity,country:'India'},teaching_modes:['ONLINE']},teacher.cookie).expect(200);const prefix='/v1/discovery?location='+encodeURIComponent(uniqueCity)+'&rate_unit=HOUR';
 await get('/v1/discovery?sort=PRICE_ASC').expect(400);await get(prefix+'&trial_kind=PAID').expect(400);await get(prefix+'&sort=PRICE_ASC&cursor='+randomUUID()).expect(400);
 let page=(await get(prefix+'&sort=PRICE_ASC&limit=2').expect(200)).body;assert.deepEqual(page.offers.map((o:any)=>o.offer.rate_paise),[20000,30000]);assert.equal(page.order,'price_ascending');const cursor=page.next_cursor;assert.ok(cursor.startsWith('p1.'));
 const rest=(await get(prefix+'&sort=PRICE_ASC&limit=2&cursor='+cursor).expect(200)).body;assert.deepEqual(rest.offers.map((o:any)=>o.offer.rate_paise),[30000,50000]);assert.equal(new Set([...page.offers,...rest.offers].map((o:any)=>o.id)).size,4);
 await get(prefix+'&sort=PRICE_DESC&cursor='+cursor).expect(400);await get(prefix+'&sort=PRICE_ASC&cursor=p1.bad').expect(400);await get(prefix+'&sort=PRICE_ASC&rate_unit=LESSON&cursor='+cursor).expect(400);
 await database.pool.query("UPDATE teaching_listings SET status='PAUSED' WHERE id=$1",[page.offers.at(-1).id]);const after=(await get(prefix+'&sort=PRICE_ASC&limit=2&cursor='+cursor).expect(200)).body;assert.deepEqual(after.offers.map((o:any)=>o.id),rest.offers.map((o:any)=>o.id));
 const desc=(await get(prefix+'&sort=PRICE_DESC&trial_kind=FREE').expect(200)).body;assert.ok(desc.offers.every((o:any)=>o.offer.trial_kind==='FREE'));assert.deepEqual(desc.offers.map((o:any)=>o.offer.rate_paise),[30000,20000]);
 const observed=await post('/v1/discovery/searches',{request_key:randomUUID(),filters:{location:uniqueCity,rate_unit:'HOUR',sort:'PRICE_DESC',trial_kind:'FREE'}}).expect(200);assert.equal(observed.body.order,'price_descending');
});
