import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,parameters,(error,key)=>error?reject(error):resolve(key)));
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function checkPassword(password: string, stored?: string): Promise<boolean> {
  const parts = stored?.split("$");
  const valid = parts?.length === 3 && parts[0] === "scrypt";
  const salt = valid ? Buffer.from(parts![1], "base64") : Buffer.alloc(16);
  const expected = valid ? Buffer.from(parts![2], "base64") : Buffer.alloc(64);
  if (salt.length !== 16 || expected.length !== 64) return false;
  const key = await derive(password, salt);
  return Boolean(valid) && timingSafeEqual(key, expected);
}
export interface EncryptedPayload { iv: string; tag: string; data: string }
export function encrypt(value: unknown, secret: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}
export function decrypt<T>(value: EncryptedPayload, secret: string): T {
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8")) as T;
}

