import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";
import type { Config } from "./config.js";
import type { Database } from "./database.js";
import { decrypt, type EncryptedPayload } from "./security.js";

export type VerificationMail = { to: string; verification_url: string; reset_url?: never } | { to: string; reset_url: string; verification_url?: never } | {to:string;availability_verification_url:string;availability_unsubscribe_url:string};
export class MailWorker {
  constructor(private readonly database: Database, private readonly config: Config, private readonly now: () => Date = () => new Date()) {}
  async tick(): Promise<boolean> {
    const now = this.now();
    await this.database.pool.query("UPDATE mail_outbox SET status='EXPIRED' WHERE expires_at<=$1 AND status IN ('PENDING','PROCESSING')", [now]);
    const result = await this.database.pool.query(
      `UPDATE mail_outbox SET status='PROCESSING',attempts=attempts+1,lease_until=$2
       WHERE id=(SELECT id FROM mail_outbox WHERE expires_at>$1 AND
         ((status='PENDING' AND available_at<=$1) OR (status='PROCESSING' AND lease_until<=$1))
         ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id,encrypted_payload,attempts`,
      [now,new Date(now.getTime()+60_000)],
    );
    const job = result.rows[0];
    if (!job) return false;
    try {
      const payload = decrypt<VerificationMail>(job.encrypted_payload as EncryptedPayload,this.config.authSecret);
      await this.deliver(job.id,payload);
      await this.database.pool.query("UPDATE mail_outbox SET status='SENT',sent_at=$2,lease_until=NULL,last_error_code=NULL WHERE id=$1", [job.id,this.now()]);
    } catch {
      await this.database.pool.query(
        "UPDATE mail_outbox SET status=$2,available_at=$3,lease_until=NULL,last_error_code='MAIL_DELIVERY_FAILED' WHERE id=$1",
        [job.id,job.attempts>=5?"FAILED":"PENDING",new Date(this.now().getTime()+2**job.attempts*1000)],
      );
      console.error("Verification mail delivery requires retry; job " + job.id);
    }
    return true;
  }
  private async deliver(id: string, payload: VerificationMail) {
    const availability='availability_verification_url' in payload;
    const recovery = !availability&&!!payload.reset_url;
    const subject = availability?'Confirm your Tutor availability alert':recovery ? 'Reset your password' : 'Verify your email';
    const url = availability?payload.availability_verification_url:payload.reset_url || payload.verification_url;
    if (this.config.mailTransport === "capture") {
      if (this.config.mode === "production") throw new Error("Capture forbidden in production");
      await mkdir(this.config.mailDir,{recursive:true});
      await writeFile(join(this.config.mailDir,id+".json"),JSON.stringify({
        id, development_only: true, to: payload.to, subject,
        ...(availability?{availability_verification_url:url,availability_unsubscribe_url:payload.availability_unsubscribe_url}:recovery ? {reset_url:url} : {verification_url:url}), captured_at: this.now().toISOString(),
      },null,2),{mode:0o600});
      return;
    }
    const settings = this.config.smtp!;
    const transport = nodemailer.createTransport({
      host: settings.host,port: settings.port,secure:settings.port===465,requireTLS:true,
      auth:{user:settings.user,pass:settings.password},tls:{minVersion:"TLSv1.2"},
      connectionTimeout:10_000,socketTimeout:20_000,
    });
    try {
      await transport.sendMail({
        from:settings.from,to:payload.to,subject,
        text:(availability?'Confirm your optional, free Tutor availability alert. This is not marketing consent. Open the link and select Confirm availability alert.':recovery ? 'Open this link to choose a new password. All sessions will be signed out after reset.' : 'Open this link and select Verify email.')+' It expires in 15 minutes.\n\n'+url+(availability?'\n\nCancel or unsubscribe at any time:\n'+payload.availability_unsubscribe_url:'')+'\n\nIf you did not request this email, you can ignore it.',
        messageId:"<"+id+"@"+new URL(this.config.webOrigin).hostname+">",
      });
    } finally { transport.close(); }
  }
}

