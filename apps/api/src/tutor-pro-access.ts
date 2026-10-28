import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
type Row=Record<string,any>;
export const proCurrentSql=`SELECT g.* FROM tutor_pro_grants g LEFT JOIN purchase_cycles p ON p.id=g.cycle_id LEFT JOIN payment_journal j ON j.id=g.capture_id LEFT JOIN coupon_redemptions r ON r.id=g.coupon_redemption_id WHERE g.payer_id=$1 AND g.test_only=$3 AND g.status='ACTIVE' AND g.starts_at<=$2 AND g.ends_at>$2 AND ((g.source='COUPON' AND r.total_paise=0 AND r.payer_id=g.payer_id AND r.product='TUTOR_PRO' AND r.test_only=g.test_only) OR (g.source='PAYMENT' AND p.product='TUTOR_PRO' AND p.payer_id=g.payer_id AND p.test_only=g.test_only AND p.status='CAPTURED' AND NOT p.resolution_required AND j.kind='CAPTURE' AND j.cycle_id=p.id AND j.amount_paise=p.amount_paise AND j.currency=p.currency))`;
export async function currentTutorPro(client:PoolClient,payer:string,at:Date,test:boolean){return (await client.query(proCurrentSql+' ORDER BY g.starts_at DESC,g.id DESC LIMIT 1',[payer,at,test])).rows[0];}
export async function activateTutorPro(client:PoolClient,cycle:Row,at:Date){
 if(cycle.product!=='TUTOR_PRO')return;
 const capture=(await client.query("SELECT j.* FROM payment_journal j JOIN purchase_cycles p ON p.id=j.cycle_id WHERE p.id=$1 AND p.status='CAPTURED' AND NOT p.resolution_required AND j.kind='CAPTURE' AND j.amount_paise=p.amount_paise AND j.currency=p.currency AND NOT EXISTS(SELECT 1 FROM purchase_cancellations c WHERE c.cycle_id=p.id) ORDER BY j.recorded_at LIMIT 1",[cycle.id])).rows[0];
 if(!capture)return;
 const grant=await client.query("INSERT INTO tutor_pro_grants(id,payer_id,source,cycle_id,capture_id,test_only,starts_at,ends_at,created_at) VALUES($1,$2,'PAYMENT',$3,$4,$5,$6,$7,$6) ON CONFLICT(cycle_id) DO NOTHING",[randomUUID(),cycle.payer_id,cycle.id,capture.id,cycle.test_only,at,new Date(at.getTime()+30*86400000)]);
 if(grant.rowCount)await client.query("INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,'TUTOR_PRO_ACTIVATED',$3,$4,$5)",[randomUUID(),cycle.payer_id,randomUUID(),at,{target:cycle.id}]);
}
export async function tutorProSummary(client:PoolClient,cycle:Row,at:Date){const g=(await client.query('SELECT * FROM tutor_pro_grants WHERE cycle_id=$1',[cycle.id])).rows[0];const usable=await currentTutorPro(client,cycle.payer_id,at,cycle.test_only);return {status:g?.status==='REVOKED'?'UNAVAILABLE':g?(new Date(g.ends_at)<=at?'EXPIRED':usable?.id===g.id?'ACTIVE':'UNAVAILABLE'):'UNAVAILABLE',starts_at:g?new Date(g.starts_at).toISOString():null,ends_at:g?new Date(g.ends_at).toISOString():null,test_only:cycle.test_only};}

export function tutorProPredicate(owner:string,at:string,test:string){return `EXISTS(${proCurrentSql.replaceAll('$1',owner).replaceAll('$2',at).replaceAll('$3',test)})`;}
