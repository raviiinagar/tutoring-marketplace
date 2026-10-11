import {randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Config} from './config.js';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {ApiProblem} from './errors.js';
import {checkPassword,decrypt,encrypt,randomToken,tokenHash} from './security.js';
import {newTotpSecret,verifyTotp} from './totp.js';

export type StaffScope='SUPPORT'|'TRUST'|'FINANCE';
export const staffCookieName=(config:Config)=>config.mode==='production'?'__Host-tm_staff':'tm_staff';
const forbidden=()=>new ApiProblem(403,'STAFF_ACCESS_DENIED','This staff area is not available to your account.');
const mfaRequired=()=>new ApiProblem(403,'STAFF_MFA_REQUIRED','Verify MFA to enter the staff console.');
const invalid=()=>new ApiProblem(400,'INVALID_MFA','The code is incorrect, expired or already used.');
const nowDefault=()=>new Date();
async function audit(client:PoolClient,userId:string,event:string,correlation:string,metadata:Record<string,unknown>,now:Date){
  await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,metadata,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),userId,event,correlation,metadata,now]);
}

// Only an operator with direct database/config access can invoke this command.
// No HTTP endpoint exposes assignment or creates/verifies a public identity.
export async function assignStaff(database:Database,email:string,scopes:StaffScope[]|null,reason:string,operator:string){
  return database.transaction(async client=>{
    const user=(await client.query('SELECT id,status,email_verified_at FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
    if(!user||(scopes&&(user.status!=='ACTIVE'||!user.email_verified_at)))throw new Error('Grant requires an active verified account; revoke requires an existing account.');
    if(scopes){
      await client.query(`INSERT INTO staff_accounts(user_id,scopes) VALUES($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET scopes=$2,enabled=true,updated_at=now()`,[user.id,[...new Set(scopes)].sort()]);
    }else{
      await client.query("UPDATE staff_accounts SET enabled=false,updated_at=now(),encrypted_pending_secret=NULL,pending_session_id=NULL,pending_expires_at=NULL WHERE user_id=$1",[user.id]);
    }
    await client.query('UPDATE staff_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[user.id]);
    await audit(client,user.id,scopes?'STAFF_SCOPES_ASSIGNED':'STAFF_ACCESS_REVOKED',randomUUID(),{operator,target:user.id,reason,scopes:scopes||[]},new Date());
    return {user_id:user.id};
  });
}

export class StaffService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly auth:AuthService,private readonly now=nowDefault){}
  private async context(client:PoolClient,accountToken?:string){
    const {user,session}=await this.auth.authenticated(client,accountToken);
    const staff=(await client.query('SELECT * FROM staff_accounts WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];
    if(!staff?.enabled)throw forbidden();return {user,session,staff};
  }
  private async elevated(client:PoolClient,userId:string,sessionId:string,staffToken?:string){
    if(!staffToken||!/^[A-Za-z0-9_-]{43}$/.test(staffToken))return undefined;
    return (await client.query(`SELECT id,expires_at FROM staff_sessions WHERE user_id=$1 AND account_session_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND expires_at>$4 FOR UPDATE`,[userId,sessionId,tokenHash(staffToken),this.now()])).rows[0];
  }
  private async reauthenticate(client:PoolClient,accountToken:string|undefined,password:string){
    const context=await this.context(client,accountToken);
    if(!await checkPassword(password,context.user.password_hash))throw new ApiProblem(401,'INVALID_CREDENTIALS','Password is incorrect.');
    return context;
  }
  private async limit(accountToken:string|undefined,ip:string){
    await this.auth.limits.consume('staff-mfa-ip',ip,30,15*60_000);
    const account=await this.auth.account(accountToken);
    await this.auth.limits.consume('staff-mfa-user',account.id,10,15*60_000);
  }
  private async issue(client:PoolClient,userId:string,sessionId:string,correlation:string){
    const token=randomToken();const expires=new Date(this.now().getTime()+30*60_000);
    await client.query('UPDATE staff_sessions SET revoked_at=$3 WHERE user_id=$1 AND account_session_id=$2 AND revoked_at IS NULL',[userId,sessionId,this.now()]);
    await client.query('INSERT INTO staff_sessions(id,user_id,account_session_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),userId,sessionId,tokenHash(token),expires,this.now()]);
    await audit(client,userId,'STAFF_SESSION_CREATED',correlation,{target:sessionId},this.now());return {token,expires};
  }
  async access(accountToken?:string,staffToken?:string){
    return this.database.transaction(async client=>{
      const {user,session,staff}=await this.context(client,accountToken);
      const elevated=staff.encrypted_secret?await this.elevated(client,user.id,session.id,staffToken):undefined;
      return {scopes:staff.scopes as StaffScope[],mfa_enrolled:!!staff.encrypted_secret,authenticated:!!elevated,expires_at:elevated?new Date(elevated.expires_at).toISOString():null};
    });
  }
  async enroll(accountToken:string|undefined,password:string,ip:string,correlation:string){
    await this.limit(accountToken,ip);
    return this.database.transaction(async client=>{
      const {user,session,staff}=await this.reauthenticate(client,accountToken,password);
      if(staff.encrypted_secret)throw new ApiProblem(409,'MFA_ALREADY_ENROLLED','Use recovery to replace a lost authenticator.');
      const secret=newTotpSecret();const expires=new Date(this.now().getTime()+10*60_000);
      await client.query('UPDATE staff_accounts SET encrypted_pending_secret=$2,pending_expires_at=$3,pending_session_id=$4 WHERE user_id=$1',[user.id,encrypt({secret},this.config.authSecret),expires,session.id]);
      await audit(client,user.id,'STAFF_MFA_ENROLLMENT_STARTED',correlation,{target:user.id},this.now());
      return {secret,expires_at:expires.toISOString(),otpauth_uri:'otpauth://totp/'+encodeURIComponent('Tutor Marketplace:'+user.email)+'?secret='+secret+'&issuer=Tutor%20Marketplace&algorithm=SHA1&digits=6&period=30'};
    });
  }
  async confirm(accountToken:string|undefined,code:string,ip:string,correlation:string){
    await this.limit(accountToken,ip);
    return this.database.transaction(async client=>{
      const {user,session,staff}=await this.context(client,accountToken);
      if(staff.encrypted_secret||!staff.encrypted_pending_secret||staff.pending_session_id!==session.id||new Date(staff.pending_expires_at)<=this.now())throw invalid();
      const {secret}=decrypt<{secret:string}>(staff.encrypted_pending_secret,this.config.authSecret);
      const counter=verifyTotp(secret,code,this.now(),-1);if(counter===null)throw invalid();
      const recovery=Array.from({length:8},()=>randomBytes(16).toString('hex'));
      await client.query('UPDATE staff_accounts SET encrypted_secret=encrypted_pending_secret,encrypted_pending_secret=NULL,pending_session_id=NULL,pending_expires_at=NULL,last_counter=$2,recovery_hashes=$3 WHERE user_id=$1',[user.id,counter,recovery.map(tokenHash)]);
      await audit(client,user.id,'STAFF_MFA_ENROLLED',correlation,{target:user.id},this.now());
      return {...await this.issue(client,user.id,session.id,correlation),recovery_codes:recovery};
    });
  }
  async signIn(accountToken:string|undefined,password:string,code:string,ip:string,correlation:string){
    await this.limit(accountToken,ip);
    return this.database.transaction(async client=>{
      const {user,session,staff}=await this.reauthenticate(client,accountToken,password);
      if(!staff.encrypted_secret)throw mfaRequired();
      const {secret}=decrypt<{secret:string}>(staff.encrypted_secret,this.config.authSecret);
      const counter=verifyTotp(secret,code,this.now(),Number(staff.last_counter));if(counter===null)throw invalid();
      await client.query('UPDATE staff_accounts SET last_counter=$2 WHERE user_id=$1',[user.id,counter]);
      return this.issue(client,user.id,session.id,correlation);
    });
  }
  async recover(accountToken:string|undefined,password:string,code:string,ip:string,correlation:string){
    await this.limit(accountToken,ip);
    await this.database.transaction(async client=>{
      const {user,staff}=await this.reauthenticate(client,accountToken,password);
      if(!staff.encrypted_secret||!staff.recovery_hashes.includes(tokenHash(code)))throw invalid();
      await client.query("UPDATE staff_accounts SET encrypted_secret=NULL,encrypted_pending_secret=NULL,pending_session_id=NULL,pending_expires_at=NULL,last_counter=-1,recovery_hashes='{}' WHERE user_id=$1",[user.id]);
      await client.query('UPDATE staff_sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL',[user.id,this.now()]);
      await audit(client,user.id,'STAFF_MFA_RECOVERED',correlation,{target:user.id,requires_enrollment:true},this.now());
    });
    return {code:'MFA_ENROLLMENT_REQUIRED',message:'Recovery accepted. Enroll a new authenticator before accessing staff areas.'};
  }
  async workspace(accountToken:string|undefined,staffToken:string|undefined,scope:StaffScope,reason?:string,correlation?:string){
    return this.database.transaction(async client=>{
      const {user,session,staff}=await this.context(client,accountToken);
      if(!staff.scopes.includes(scope))throw forbidden();
      if(!staff.encrypted_secret||!await this.elevated(client,user.id,session.id,staffToken))throw mfaRequired();
      if(reason)await audit(client,user.id,'STAFF_WORKSPACE_ACCESSED',correlation!,{target:'workspace:'+scope,scope,reason},this.now());
      const rows=(await client.query("SELECT id,user_id,event_type,created_at,metadata FROM audit_events WHERE event_type='STAFF_WORKSPACE_ACCESSED' AND metadata->>'scope'=$1 ORDER BY created_at DESC,id DESC LIMIT 20",[scope])).rows;
      return {scope,events:rows.map(row=>({id:row.id,actor_id:row.user_id,event:row.event_type,created_at:new Date(row.created_at).toISOString(),target:row.metadata.target,reason:row.metadata.reason}))};
    });
  }
  async authorize(client:PoolClient,accountToken:string|undefined,staffToken:string|undefined,scope:StaffScope){
    const context=await this.context(client,accountToken);
    if(!context.staff.scopes.includes(scope))throw forbidden();
    if(!context.staff.encrypted_secret||!await this.elevated(client,context.user.id,context.session.id,staffToken))throw mfaRequired();
    return context.user;
  }
  async signOut(accountToken:string|undefined,staffToken:string|undefined,correlation:string){
    await this.database.transaction(async client=>{
      const {user,session}=await this.context(client,accountToken);
      const elevated=await this.elevated(client,user.id,session.id,staffToken);
      if(elevated){await client.query('UPDATE staff_sessions SET revoked_at=$2 WHERE id=$1',[elevated.id,this.now()]);await audit(client,user.id,'STAFF_SESSION_REVOKED',correlation,{target:elevated.id},this.now());}
    });
  }
}
