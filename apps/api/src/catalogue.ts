import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {Database} from './database.js';
import {StaffService} from './staff.js';
import {ApiProblem} from './errors.js';

export const catalogueKind=z.enum(['SUBJECT','LEVEL','CURRICULUM','EXAM','LANGUAGE']);
const slug=z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
export const termInput=z.strictObject({kind:catalogueKind,id:slug,label:z.string().trim().min(2).max(100),aliases:z.array(z.string().trim().min(2).max(100)).max(15),domain_ids:z.array(slug).min(1).max(8).refine(ids=>new Set(ids).size===ids.length),active:z.boolean(),reason:z.string().trim().min(10).max(240)});
export const selectionInput=z.strictObject({domain_id:slug,subject_id:slug,level_id:slug,curriculum_id:slug.optional(),exam_id:slug.optional(),language_id:slug});
export type CatalogueSelection=z.infer<typeof selectionInput>;
export function normalizeCatalogueName(value:string){return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}

export class CatalogueService {
  constructor(private readonly database:Database,private readonly staff:StaffService){}
  private async snapshot(client:PoolClient,includeInactive:boolean){
    const domains=(await client.query('SELECT id,label FROM learning_domains ORDER BY position')).rows;
    const terms=(await client.query(`SELECT t.id,t.kind,t.label,t.active,t.aliases,t.domain_ids FROM catalogue_terms t ${includeInactive?'':'WHERE active'} ORDER BY kind,label,id`)).rows;
    return {domains,terms};
  }
  async publicCatalogue(){return this.database.transaction(client=>this.snapshot(client,false));}
  async staffCatalogue(account?:string,token?:string){return this.database.transaction(async client=>{await this.staff.authorize(client,account,token,'TRUST');return this.snapshot(client,true);});}
  async save(account:string|undefined,token:string|undefined,input:z.infer<typeof termInput>,correlation:string){
    return this.database.transaction(async client=>{
      const user=await this.staff.authorize(client,account,token,'TRUST');
      // Serialize name ownership changes, including aliases of inactive terms.
      await client.query('SELECT pg_advisory_xact_lock(73501905)');
      const domains=(await client.query('SELECT id FROM learning_domains WHERE id=ANY($1::text[])',[input.domain_ids])).rows;
      if(domains.length!==input.domain_ids.length)throw new ApiProblem(400,'INVALID_CATALOGUE','Unknown Learning Domain.');
      const existing=(await client.query('SELECT kind FROM catalogue_terms WHERE id=$1 FOR UPDATE',[input.id])).rows[0];
      if(existing&&existing.kind!==input.kind)throw new ApiProblem(409,'IMMUTABLE_KIND','A catalogue identifier cannot change its type.');
      const names=[input.label,...input.aliases].map(normalizeCatalogueName);
      if(names.some(name=>!name)||new Set(names).size!==names.length)throw new ApiProblem(400,'DUPLICATE_ALIAS','Use distinct meaningful names and aliases.');
      const conflict=await client.query('SELECT term_id FROM catalogue_names WHERE kind=$1 AND name=ANY($2::text[]) AND term_id<>$3',[input.kind,names,input.id]);
      if(conflict.rowCount)throw new ApiProblem(409,'CATALOGUE_NAME_CONFLICT','This name or alias already belongs to another term.');
      await client.query(`INSERT INTO catalogue_terms(id,kind,label,aliases,domain_ids,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET label=excluded.label,aliases=excluded.aliases,domain_ids=excluded.domain_ids,active=excluded.active`,[input.id,input.kind,input.label,input.aliases,input.domain_ids,input.active]);
      await client.query('DELETE FROM catalogue_names WHERE term_id=$1',[input.id]);
      for(const name of names)await client.query('INSERT INTO catalogue_names(kind,name,term_id) VALUES($1,$2,$3)',[input.kind,name,input.id]);
      await client.query('INSERT INTO audit_events(id,user_id,event_type,correlation_id,metadata) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.id,'CATALOGUE_TERM_SAVED',correlation,{target:input.id,kind:input.kind,active:input.active,reason:input.reason}]);
      return {term:(await client.query('SELECT * FROM catalogue_terms WHERE id=$1',[input.id])).rows[0]};
    });
  }
  async resolve(kind:z.infer<typeof catalogueKind>,value:string){
    const row=(await this.database.pool.query('SELECT t.id,t.kind,t.label,t.aliases,t.domain_ids,t.active FROM catalogue_names n JOIN catalogue_terms t ON t.id=n.term_id WHERE n.kind=$1 AND n.name=$2 AND t.active',[kind,normalizeCatalogueName(value)])).rows[0];
    if(!row)throw new ApiProblem(404,'CATALOGUE_TERM_NOT_FOUND','No active catalogue term matches.');return {term:row};
  }
  // Future listing/discovery callers use this in their own transaction. Row locks
  // prevent a term being deactivated during an authorised selection write.
  async requireSelection(client:PoolClient,input:CatalogueSelection){
    if(!(await client.query('SELECT id FROM learning_domains WHERE id=$1',[input.domain_id])).rowCount)throw new ApiProblem(400,'INVALID_CATALOGUE','Unknown Learning Domain.');
    const fields=[['SUBJECT',input.subject_id],['LEVEL',input.level_id],['CURRICULUM',input.curriculum_id],['EXAM',input.exam_id],['LANGUAGE',input.language_id]].filter(([,id])=>id);
    const ids=fields.map(([,id])=>id);
    const rows=(await client.query('SELECT id,kind,active,domain_ids FROM catalogue_terms WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',[ids])).rows;
    for(const [kind,id] of fields){const term=rows.find(row=>row.id===id);if(!term||!term.active||term.kind!==kind||!term.domain_ids.includes(input.domain_id))throw new ApiProblem(400,'INVALID_CATALOGUE','Select active options belonging to this Learning Domain and field.');}
    return input;
  }
  validate(input:CatalogueSelection){return this.database.transaction(async client=>({selection:await this.requireSelection(client,input)}));}
}
