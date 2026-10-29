import crypto from 'crypto';

function key(): Buffer {
  const k = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  return k;
}
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
export function hmacHex(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}
export function hmacB64(secret: string, data: string | Buffer) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64');
}
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export const randomId = (n = 16) => crypto.randomBytes(n).toString('hex');
