import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import sharp from 'sharp';
import {z} from 'zod';
import {Database} from './database.js';
import {AuthService} from './auth.js';
import {StaffService} from './staff.js';
import type {Config} from './config.js';
import type {EvidenceScanner} from './evidence-scanner.js';
import {ApiProblem} from './errors.js';
import {encrypt,decrypt} from './security.js';

export const photoInput=z.strictObject({media_type:z.enum(['image/jpeg','image/png']),data:z.string().min(4).max(1398104),public_consent:z.literal(true)});
export const photoReview=z.strictObject({outcome:z.enum(['APPROVE','REJECT','REVOKE']),reason:z.string().trim().min(10).max(240)});
const columns='id,user_id,status,scan_status,test_only,byte_length,review_reason,created_at';
const missing=()=>new ApiProblem(404,'NOT_FOUND','Tutor photo not found.');
const invalid=()=>new ApiProblem(400,'INVALID_PHOTO','Use a valid single-frame JPEG or PNG, 128 pixels per side or larger, at most 1 MiB and 4 million pixels.');

export class TutorPhotosService {
  constructor(private readonly database:Database,private readonly config:Config,private readonly auth:AuthService,private readonly staff:StaffService,private readonly scanner:EvidenceScanner|undefined,private readonly now:()=>Date=()=>new Date()){
    if(config.mode==='production'&&scanner?.testOnly)throw new Error('Test photo scanner is forbidden in production');
  }
  policy(){return {uploads_enabled:!!this.scanner,test_only:!!this.scanner?.testOnly,max_bytes:1048576,media_types:['image/jpeg','image/png'],notice:'Upload your own portrait only. After Trust approval, your photo appears publicly on eligible teaching offers. Do not upload identity documents or photos of children.'};}
  private async owner(client:PoolClient,token?:string){const {user}=await this.auth.authenticated(client,token);if(!user.roles.includes('TUTOR'))throw new ApiProblem(403,'TUTOR_ROLE_REQUIRED','Choose the Tutor role in your account.');if(!(await client.query('SELECT user_id FROM tutor_profiles WHERE user_id=$1 FOR UPDATE',[user.id])).rowCount)throw new ApiProblem(409,'PROFILE_REQUIRED','Create a Tutor profile first.');return user;}
  private audit(client:PoolClient,actor:string,event:string,target:string,correlation:string,metadata:Record<string,unknown>={}){return client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,event,correlation,this.now(),{target,...metadata}]);}
  async own(token?:string){return this.database.transaction(async client=>{const user=await this.owner(client,token);const photo=(await client.query(`SELECT ${columns} FROM tutor_photos WHERE user_id=$1 AND status<>'REMOVED' ORDER BY created_at DESC,id DESC LIMIT 1`,[user.id])).rows[0];return {policy:this.policy(),photo:photo||null};});}
  async upload(token:string|undefined,input:z.infer<typeof photoInput>,correlation:string){
    const user=await this.database.transaction(client=>this.owner(client,token));
    if(!this.scanner)throw new ApiProblem(503,'SCANNER_UNAVAILABLE','Photo uploads are unavailable until scanning is configured.');
    await this.auth.limits.consume('tutor-photo-user',user.id,6,3600000);
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data))throw invalid();
    const raw=Buffer.from(input.data,'base64');if(raw.length<8||raw.length>1048576||raw.toString('base64')!==input.data)throw invalid();
    const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpeg=raw[0]===255&&raw[1]===216&&raw[2]===255;
    if(input.media_type==='image/png'?!png:!jpeg)throw invalid();
    let bytes:Buffer;
    try{
      const image=sharp(raw,{limitInputPixels:4000000,failOn:'warning'});const meta=await image.metadata();
      if(meta.format!==(input.media_type==='image/png'?'png':'jpeg')||(meta.pages||1)!==1||!meta.width||!meta.height||meta.width<128||meta.height<128)throw invalid();
      // Re-encoding strips EXIF/GPS and appended data. Original bytes are never persisted or served.
      bytes=await image.autoOrient().resize(640,800,{fit:'cover'}).jpeg({quality:82}).timeout({seconds:5}).toBuffer();
      if(bytes.length>524288)throw invalid();
    }catch{throw invalid();}
    let scan:'CLEAN'|'REJECTED'|'ERROR'='ERROR';try{scan=await this.scanner.scan(raw);}catch{}
    return this.database.transaction(async client=>{
      const current=await this.owner(client,token);const id=randomUUID();
      await client.query("UPDATE tutor_photos SET status='REMOVED',encrypted_payload=NULL,byte_length=0 WHERE user_id=$1 AND status IN ('PENDING','APPROVED')",[current.id]);
      await client.query('INSERT INTO tutor_photos(id,user_id,status,scan_status,test_only,encrypted_payload,byte_length,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,current.id,scan==='CLEAN'?'PENDING':'REJECTED',scan,this.scanner!.testOnly,scan==='CLEAN'?encrypt({data:bytes.toString('base64')},this.config.authSecret):null,scan==='CLEAN'?bytes.length:0,this.now()]);
      await this.audit(client,current.id,'TUTOR_PHOTO_UPLOADED',id,correlation,{scan_status:scan});
      return {photo:(await client.query(`SELECT ${columns} FROM tutor_photos WHERE id=$1`,[id])).rows[0]};
    });
  }
  async remove(token:string|undefined,id:string,correlation:string){return this.database.transaction(async client=>{const user=await this.owner(client,token);const row=(await client.query('SELECT id,status FROM tutor_photos WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,user.id])).rows[0];if(!row)throw missing();if(row.status!=='REMOVED'){await client.query("UPDATE tutor_photos SET status='REMOVED',encrypted_payload=NULL,byte_length=0 WHERE id=$1",[id]);await this.audit(client,user.id,'TUTOR_PHOTO_REMOVED',id,correlation);}});}
  private image(row:Record<string,any>){if(row.scan_status!=='CLEAN'||!row.encrypted_payload||!['PENDING','APPROVED'].includes(row.status)||this.config.mode==='production'&&row.test_only)throw missing();return Buffer.from(decrypt<{data:string}>(row.encrypted_payload,this.config.authSecret).data,'base64');}
  async preview(token:string|undefined,id:string){return this.database.transaction(async client=>{const user=await this.owner(client,token);const row=(await client.query('SELECT * FROM tutor_photos WHERE id=$1 AND user_id=$2',[id,user.id])).rows[0];if(!row)throw missing();return this.image(row);});}
  async queue(account?:string,token?:string){return this.database.transaction(async client=>{await this.staff.authorize(client,account,token,'TRUST');return {photos:(await client.query("SELECT p.id,p.status,p.scan_status,t.display_name FROM tutor_photos p JOIN tutor_profiles t ON t.user_id=p.user_id WHERE p.status IN ('PENDING','APPROVED') AND (NOT $1::boolean OR NOT p.test_only) ORDER BY p.created_at DESC,p.id LIMIT 100",[this.config.mode==='production'])).rows};});}
  private async target(client:PoolClient,account:string|undefined,token:string|undefined,id:string){const found=(await client.query('SELECT user_id FROM tutor_photos WHERE id=$1',[id])).rows[0];const actor=await this.staff.authorize(client,account,token,'TRUST',found?[found.user_id]:[]);const row=(await client.query('SELECT * FROM tutor_photos WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row||row.status==='REMOVED'||this.config.mode==='production'&&row.test_only)throw missing();if(row.user_id===actor.id)throw new ApiProblem(403,'SELF_REVIEW','A different Trust reviewer must review your photo.');return {actor,row};}
  async inspect(account:string|undefined,token:string|undefined,id:string,reason:string,correlation:string){return this.database.transaction(async client=>{const {actor,row}=await this.target(client,account,token,id);const bytes=this.image(row);await this.audit(client,actor.id,'TUTOR_PHOTO_INSPECTED',id,correlation,{reason});return bytes;});}
  async review(account:string|undefined,token:string|undefined,id:string,input:z.infer<typeof photoReview>,correlation:string){return this.database.transaction(async client=>{const {actor,row}=await this.target(client,account,token,id);if(input.outcome==='REVOKE'?row.status!=='APPROVED':row.status!=='PENDING')throw new ApiProblem(409,'PHOTO_STATE_CHANGED','This photo no longer awaits that decision.');if(input.outcome==='APPROVE')this.image(row);await client.query('UPDATE tutor_photos SET status=$2,reviewed_by=$3,review_reason=$4,reviewed_at=$5,encrypted_payload=CASE WHEN $2=$6 THEN encrypted_payload ELSE NULL END,byte_length=CASE WHEN $2=$6 THEN byte_length ELSE 0 END WHERE id=$1',[id,input.outcome==='APPROVE'?'APPROVED':'REJECTED',actor.id,input.reason,this.now(),'APPROVED']);await this.audit(client,actor.id,'TUTOR_PHOTO_'+input.outcome,id,correlation,{reason:input.reason});return {photo:(await client.query(`SELECT ${columns} FROM tutor_photos WHERE id=$1`,[id])).rows[0]};});}
}
