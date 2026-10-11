import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Buffer):string {
  let bits=0;let value=0;let output='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){output+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
  if(bits)output+=alphabet[(value<<(5-bits))&31];return output;
}
function decode(secret:string):Buffer {
  let bits=0;let value=0;const bytes:number[]=[];
  for(const character of secret){const index=alphabet.indexOf(character);if(index<0)throw new Error('Invalid MFA secret');value=(value<<5)|index;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
  return Buffer.from(bytes);
}
export const newTotpSecret=()=>base32(randomBytes(20));
// RFC 6238: HMAC-SHA1, 30-second steps, dynamic truncation. Eight digits are
// supported for published vectors; the product uses six for authenticator apps.
export function totp(secret:string,now:Date,digits=6):string {
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now.getTime()/30_000)));
  const digest=createHmac('sha1',decode(secret)).update(counter).digest();const offset=digest[digest.length-1]&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%10**digits).toString().padStart(digits,'0');
}
export function verifyTotp(secret:string,code:string,now:Date,lastCounter:number):number|null {
  if(!/^\d{6}$/.test(code))return null;const current=Math.floor(now.getTime()/30_000);
  for(const counter of [current,current-1,current+1]){
    if(counter<0||counter<=lastCounter)continue;
    if(timingSafeEqual(Buffer.from(totp(secret,new Date(counter*30_000))),Buffer.from(code)))return counter;
  }
  return null;
}
