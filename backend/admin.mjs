import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { db } from './db.mjs';
import { hashPassword, generateTotpSecret } from './security.mjs';

try {
  if (process.argv[2] === 'totp') {
    const secret = generateTotpSecret();
    console.log(`OWNER_TOTP_SECRET=${secret}`);
    console.log(`otpauth://totp/Mach:owner?secret=${secret}&issuer=Mach&algorithm=SHA1&digits=6&period=30`);
    console.log('Lưu bí mật trong .env.deploy và nhập vào ứng dụng Authenticator. Không chia sẻ đầu ra này.');
  } else if (process.argv[2] === 'migrate') {
    await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    console.log('Schema ready');
  } else if (process.argv[2] === 'owner') {
    const username = process.env.OWNER_USERNAME?.trim();
    const password = process.env.OWNER_PASSWORD;
    if (!username || username.length > 80 || !password) throw new Error('Đặt OWNER_USERNAME và OWNER_PASSWORD (14+ ký tự) qua môi trường, không qua đối số CLI.');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('owner:bootstrap'))");
      const existing = await client.query('SELECT id,username FROM owners LIMIT 1');
      if (existing.rows[0] && existing.rows[0].username !== username) throw new Error('Chỉ hỗ trợ một chủ cửa hàng. Dùng tên hiện có để đổi mật khẩu.');
      const { rows } = await client.query('INSERT INTO owners(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash RETURNING id', [randomUUID(), username, hashPassword(password)]);
      await client.query('DELETE FROM sessions WHERE owner_id=$1', [rows[0].id]);
      await client.query('COMMIT');
      console.log('Owner ready; previous sessions revoked');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } else throw new Error('Usage: node backend/admin.mjs migrate|owner|totp');
} finally { await db.end(); }
