import { randomUUID } from "node:crypto";
import type { Account, AccountRole, Login, Registration } from "@tutoring/contracts";
import type { PoolClient } from 'pg';
import type { Config } from "./config.js";
import type { Database } from "./database.js";
import { ApiProblem } from "./errors.js";
import { RateLimiter } from "./rate-limit.js";
import { checkPassword, encrypt, hashPassword, randomToken, tokenHash } from "./security.js";

const minute = 60_000;
export class AuthService {
  readonly limits: RateLimiter;
  constructor(private readonly database: Database, private readonly config: Config, readonly now: () => Date = () => new Date()) {
    this.limits = new RateLimiter(database, config.authSecret, now);
  }
  async register(input: Registration, ip: string, correlation: string) {
    await this.limits.consume("register-ip", ip, 20, 60 * minute);
    await this.limits.consume("register-email", input.email, 3, 60 * minute);
    const passwordHash = await hashPassword(input.password);
    const token = randomToken();
    const now = this.now();
    const expires = new Date(now.getTime() + 15 * minute);
    await this.database.transaction(async client => {
      const id = randomUUID();
      const user = await client.query(
        "INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING id",
        [id,input.email,input.display_name,passwordHash,now],
      );
      if (!user.rows.length) return;
      await client.query("INSERT INTO email_verifications(id,user_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)", [randomUUID(),id,tokenHash(token),expires,now]);
      const url = this.config.webOrigin + "/auth/verify#token=" + encodeURIComponent(token);
      const payload = encrypt({ to: input.email, verification_url: url }, this.config.authSecret);
      await client.query("INSERT INTO mail_outbox(id,user_id,encrypted_payload,expires_at,available_at,created_at) VALUES($1,$2,$3,$4,$5,$5)", [randomUUID(),id,payload,expires,now]);
      await client.query("INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at) VALUES($1,$2,'ACCOUNT_REGISTERED',$3,$4)", [randomUUID(),id,correlation,now]);
    });
    return { code: "VERIFICATION_REQUIRED", message: "If this email can be registered, a verification email will arrive shortly." };
  }
  async verify(token: string, ip: string, correlation: string) {
    await this.limits.consume("verify-ip", ip, 20, 15 * minute);
    const now = this.now();
    return this.database.transaction(async client => {
      const result = await client.query(
        `SELECT v.id,v.user_id,v.expires_at,v.consumed_at,u.status
         FROM email_verifications v JOIN users u ON u.id=v.user_id WHERE v.token_hash=$1 FOR UPDATE OF v,u`,
        [tokenHash(token)],
      );
      const row = result.rows[0];
      if (!row || row.consumed_at || new Date(row.expires_at) <= now || row.status !== "PENDING")
        throw new ApiProblem(400, "INVALID_OR_EXPIRED_TOKEN", "This verification link is invalid or expired.");
      await client.query("UPDATE email_verifications SET consumed_at=$2 WHERE id=$1", [row.id,now]);
      await client.query("UPDATE users SET email_verified_at=$2,status='ACTIVE' WHERE id=$1", [row.user_id,now]);
      await client.query("INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at) VALUES($1,$2,'EMAIL_VERIFIED',$3,$4)", [randomUUID(),row.user_id,correlation,now]);
      return { code: "EMAIL_VERIFIED", message: "Email verified. You can now sign in." };
    });
  }
  async resend(email: string, ip: string) {
    await this.limits.consume("resend-ip",ip,20,60*minute);
    await this.limits.consume("resend-email",email,3,60*minute);
    const now=this.now();const expires=new Date(now.getTime()+15*minute);const token=randomToken();
    await this.database.transaction(async client=>{
      const result=await client.query("SELECT id FROM users WHERE email=$1 AND status='PENDING' FOR UPDATE",[email]);
      if(!result.rows[0])return;
      const id=result.rows[0].id;
      await client.query("INSERT INTO email_verifications(id,user_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)",[randomUUID(),id,tokenHash(token),expires,now]);
      await client.query("INSERT INTO mail_outbox(id,user_id,encrypted_payload,expires_at,available_at,created_at) VALUES($1,$2,$3,$4,$5,$5)",[randomUUID(),id,encrypt({to:email,verification_url:this.config.webOrigin+'/auth/verify#token='+token},this.config.authSecret),expires,now]);
    });
    return {code:'VERIFICATION_REQUIRED',message:'If this email needs verification, a new link will arrive shortly.'};
  }
  async login(input: Login, ip: string, correlation: string) {
    await this.limits.consume("login-ip", ip, 30, 15 * minute);
    await this.limits.consume("login-email", input.email, 10, 15 * minute);
    const result = await this.database.pool.query("SELECT * FROM users WHERE email=$1", [input.email]);
    const row = result.rows[0];
    if (!await checkPassword(input.password, row?.password_hash) || row?.status === "DISABLED")
      throw new ApiProblem(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    if (!row.email_verified_at || row.status !== "ACTIVE")
      throw new ApiProblem(403, "EMAIL_NOT_VERIFIED", "Verify your email before signing in.");
    const token = randomToken();
    const now = this.now();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * minute);
    let account = row;
    await this.database.transaction(async client => {
      // Recheck/lock eligibility immediately before session creation.
      const current = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [row.id]);
      if (current.rows[0]?.status !== "ACTIVE" || !current.rows[0]?.email_verified_at || current.rows[0]?.password_hash !== row.password_hash)
        throw new ApiProblem(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      account = current.rows[0];
      await client.query("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)", [randomUUID(),row.id,tokenHash(token),expires,now]);
      await client.query("INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at) VALUES($1,$2,'SESSION_CREATED',$3,$4)", [randomUUID(),row.id,correlation,now]);
    });
    return { token, expires, user: this.publicAccount(account) };
  }
  async account(token?: string): Promise<Account> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiProblem(401, "UNAUTHENTICATED", "Please sign in.");
    const result = await this.database.pool.query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL`,
      [tokenHash(token),this.now()],
    );
    if (!result.rows[0]) throw new ApiProblem(401, "UNAUTHENTICATED", "Please sign in.");
    return this.publicAccount(result.rows[0]);
  }
  async logout(token: string | undefined, correlation: string) {
    if (!token) return;
    await this.database.transaction(async client => {
      // Match authenticated operations' user -> session order. The audit event's
      // user foreign key otherwise acquires a user lock after revoking the session.
      const found = (await client.query("SELECT user_id FROM sessions WHERE token_hash=$1", [tokenHash(token)])).rows[0];
      if (!found) return;
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [found.user_id]);
      const result = await client.query("UPDATE sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL RETURNING user_id", [tokenHash(token),this.now()]);
      if (result.rows[0]) await client.query("INSERT INTO audit_events(id,user_id,event_type,correlation_id) VALUES($1,$2,'SESSION_REVOKED',$3)", [randomUUID(),result.rows[0].user_id,correlation]);
    });
  }
  async requestRecovery(email: string, ip: string) {
    await this.limits.consume('recovery-ip', ip, 20, 60 * minute);
    await this.limits.consume('recovery-email', email, 3, 60 * minute);
    const now = this.now(); const expires = new Date(now.getTime() + 15 * minute); const token = randomToken();
    await this.database.transaction(async client => {
      const result = await client.query("SELECT id FROM users WHERE email=$1 AND status='ACTIVE' AND email_verified_at IS NOT NULL FOR UPDATE", [email]);
      const user = result.rows[0]; if (!user) return;
      await client.query('INSERT INTO password_resets(id,user_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)', [randomUUID(),user.id,tokenHash(token),expires,now]);
      await client.query('INSERT INTO mail_outbox(id,user_id,encrypted_payload,expires_at,available_at,created_at) VALUES($1,$2,$3,$4,$5,$5)', [randomUUID(),user.id,encrypt({to:email,reset_url:this.config.webOrigin+'/auth/reset-password#token='+token},this.config.authSecret),expires,now]);
    });
    return {code:'RECOVERY_REQUESTED',message:'If this email belongs to an eligible account, a password reset link will arrive shortly.'};
  }
  async resetPassword(token: string, password: string, ip: string, correlation: string) {
    await this.limits.consume('reset-ip',ip,20,15*minute);
    // Do the same expensive work for valid and unknown tokens, outside the transaction.
    const passwordHash = await hashPassword(password); const now = this.now();
    await this.database.transaction(async client => {
      const found = await client.query('SELECT user_id FROM password_resets WHERE token_hash=$1',[tokenHash(token)]);
      const id = found.rows[0]?.user_id;
      const user = id ? (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0] : undefined;
      const reset = (await client.query('SELECT * FROM password_resets WHERE token_hash=$1 FOR UPDATE',[tokenHash(token)])).rows[0];
      if (!user || user.status !== 'ACTIVE' || !user.email_verified_at || !reset || reset.consumed_at || new Date(reset.expires_at) <= now)
        throw new ApiProblem(400,'INVALID_OR_EXPIRED_TOKEN','This reset link is invalid or expired.');
      await client.query('UPDATE users SET password_hash=$2 WHERE id=$1',[id,passwordHash]);
      await client.query('UPDATE password_resets SET consumed_at=$2 WHERE user_id=$1 AND consumed_at IS NULL',[id,now]);
      await client.query('UPDATE sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL',[id,now]);
      await this.audit(client,id,'PASSWORD_RESET',correlation,{sessions_revoked:true});
    });
    return {code:'PASSWORD_RESET',message:'Password updated. All sessions have been signed out. Sign in with your new password.'};
  }
  async authenticated(client: PoolClient, token?: string, participants: string[] = []) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiProblem(401,'UNAUTHENTICATED','Please sign in.');
    const found = (await client.query('SELECT user_id FROM sessions WHERE token_hash=$1',[tokenHash(token)])).rows[0];
    // Multi-account commands lock participants in UUID order before the session.
    // This keeps opposing Learner/Tutor requests from locking A->B and B->A.
    const users = found ? (await client.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[found.user_id,...participants]])).rows : [];
    const user = users.find(row=>row.id===found?.user_id);
    const session = (await client.query('SELECT * FROM sessions WHERE token_hash=$1 FOR UPDATE',[tokenHash(token)])).rows[0];
    if (!user || user.status !== 'ACTIVE' || !user.email_verified_at || !session || session.revoked_at || new Date(session.expires_at) <= this.now())
      throw new ApiProblem(401,'UNAUTHENTICATED','Please sign in.');
    return {user,session};
  }
  private async audit(client: PoolClient, id: string, event: string, correlation: string, metadata: Record<string,unknown>) {
    await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,event,correlation,this.now(),metadata]);
  }
  async changeRoles(token: string | undefined, roles: AccountRole[], correlation: string) {
    return this.database.transaction(async client => {
      const {user} = await this.authenticated(client,token); const sorted = [...roles].sort();
      if (JSON.stringify([...user.roles].sort()) !== JSON.stringify(sorted)) {
        await client.query('UPDATE users SET roles=$2 WHERE id=$1',[user.id,sorted]);
        await this.audit(client,user.id,'ACCOUNT_ROLES_CHANGED',correlation,{previous_roles:user.roles,roles:sorted});
      }
      return {user:this.publicAccount({...user,roles:sorted})};
    });
  }
  async sessions(token?: string) {
    return this.database.transaction(async client => {
      const {user,session} = await this.authenticated(client,token);
      const rows = (await client.query('SELECT id,created_at,expires_at FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>$2 ORDER BY created_at DESC,id',[user.id,this.now()])).rows;
      return {sessions:rows.map(row => ({id:row.id,created_at:new Date(row.created_at).toISOString(),expires_at:new Date(row.expires_at).toISOString(),current:row.id===session.id}))};
    });
  }
  async revokeSessions(token: string | undefined, target: string, correlation: string) {
    await this.database.transaction(async client => {
      const {user,session} = await this.authenticated(client,token);
      if (target === 'others') {
        const result = await client.query('UPDATE sessions SET revoked_at=$3 WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL RETURNING id',[user.id,session.id,this.now()]);
        await this.audit(client,user.id,'OTHER_SESSIONS_REVOKED',correlation,{count:result.rowCount});
      } else {
        const result = await client.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,$3) WHERE user_id=$1 AND id=$2 RETURNING id',[user.id,target,this.now()]);
        if (!result.rows[0]) throw new ApiProblem(404,'NOT_FOUND','Session not found.');
        await this.audit(client,user.id,'SESSION_REVOKED',correlation,{session_id:target});
      }
    });
  }
  private publicAccount(row: Record<string, any>): Account {
    return { id: row.id, display_name: row.display_name, email: row.email, email_verified: true, created_at: new Date(row.created_at).toISOString(), roles: row.roles };
  }
}

