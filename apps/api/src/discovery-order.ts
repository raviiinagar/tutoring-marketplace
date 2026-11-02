import {z} from 'zod';
export const priceSort=z.enum(['PRICE_ASC','PRICE_DESC']);
const cursorData=z.strictObject({v:z.literal(1),sort:priceSort,unit:z.enum(['HOUR','LESSON']),rate:z.number().int().min(100).max(10000000),id:z.uuid()});
export type PriceCursor=z.infer<typeof cursorData>;
export function readPriceCursor(raw:string):PriceCursor|undefined{
 if(!/^p1\.[A-Za-z0-9_-]{1,240}$/.test(raw))return undefined;
 try{const parsed=cursorData.safeParse(JSON.parse(Buffer.from(raw.slice(3),'base64url').toString('utf8')));return parsed.success?parsed.data:undefined;}catch{return undefined;}
}
export function writePriceCursor(sort:PriceCursor['sort'],unit:PriceCursor['unit'],row:{id:string;payload:{rate_paise:number}}){return 'p1.'+Buffer.from(JSON.stringify({v:1,sort,unit,rate:row.payload.rate_paise,id:row.id})).toString('base64url');}
