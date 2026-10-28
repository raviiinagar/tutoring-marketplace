import {RefundsService} from '../src/refunds.js';
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
