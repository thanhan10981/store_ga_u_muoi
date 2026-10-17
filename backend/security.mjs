import { randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { HttpError } from './domain.mjs';

export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function hashPassword(password) {
  if (password.length < 14 || password.length > 256) throw new Error('Mật khẩu phải dài từ 14 đến 256 ký tự.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  const [kind, salt, expected] = encoded.split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{128}$/.test(expected ?? '') || !/^[a-f0-9]{32}$/.test(salt ?? '')) return false;
  const actual = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function safeEqual(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0 && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function generateTotpSecret() { return Array.from(randomBytes(32), b => alphabet[b & 31]).join(''); }
export function totp(secret, counter) {
  let bits = 0; let value = 0; const bytes = [];
  for (const c of secret) {
    const index = alphabet.indexOf(c);
    if (index < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30000);
  for (const step of [counter, counter - 1, counter + 1]) if (safeEqual(totp(secret, step), code)) return step;
  return null;
}
export async function rateLimit(db, key, limit, seconds = 60) {
  const { rows } = await db.query(`INSERT INTO rate_limits(key,window_start,count) VALUES($1,now(),1)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.window_start < now()-make_interval(secs=>$2) THEN 1 ELSE rate_limits.count+1 END,
    window_start=CASE WHEN rate_limits.window_start < now()-make_interval(secs=>$2) THEN now() ELSE rate_limits.window_start END RETURNING count`, [key, seconds]);
  if (rows[0].count > limit) throw new HttpError(429, 'Đã vượt hạn mức. Vui lòng thử lại sau.');
}
