import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { db, assertRuntimeRole, confirmDraft, report } from './db.mjs';
import { chat } from './ai.mjs';
import { HttpError, requireOrigin } from './domain.mjs';
import { hashToken, token, safeEqual, verifyPassword, verifyTotp, rateLimit } from './security.mjs';

export function createStoreServer({ database = db, chatHandler = chat } = {}) {
  const pool = database;
  const origin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000').origin;
  const production = process.env.NODE_ENV === 'production';
  if ((!process.env.DATABASE_URL && !process.env.PGHOST) || (process.env.BACKEND_PROXY_SECRET?.length ?? 0) < 32) throw new Error('DATABASE_URL (hoặc PGHOST) và BACKEND_PROXY_SECRET (ít nhất 32 ký tự) là bắt buộc.');
  if (production && !origin.startsWith('https://')) throw new Error('Production bắt buộc APP_ORIGIN HTTPS.');
  const totpSecret = process.env.OWNER_TOTP_SECRET ?? '';
  if ((production || totpSecret) && !/^[A-Z2-7]{32}$/.test(totpSecret)) throw new Error('Production bắt buộc OWNER_TOTP_SECRET base32 dài 32 ký tự.');
  const dailyLimit = Number(process.env.AI_DAILY_LIMIT ?? 100);
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000) throw new Error('AI_DAILY_LIMIT phải từ 1 đến 10000.');
  const cookieName = production ? '__Host-store_session' : 'store_session';
  function cookie(value, age) { return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`; }
  async function body(req) {
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Yêu cầu cần JSON.');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new HttpError(413, 'Yêu cầu quá lớn.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'JSON không hợp lệ.'); }
  }
  function sessionToken(req) {
    return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
  }
  async function session(req) {
    const value = sessionToken(req);
    if (!/^[a-f0-9]{64}$/.test(value)) throw new HttpError(401, 'Vui lòng đăng nhập.');
    const { rows } = await pool.query('SELECT s.owner_id,s.csrf,o.username FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE token_hash=$1 AND expires_at>now()', [hashToken(value)]);
    if (!rows[0]) throw new HttpError(401, 'Phiên đăng nhập hết hạn.');
    return rows[0];
  }
  const active = new Set();
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    let stage = 'request';
    const send = (status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Request-Id': requestId, ...headers }); res.end(JSON.stringify(value)); };
    try {
      // Render probes this endpoint without the private proxy key. No store data is exposed.
      if (req.method === 'GET' && req.url === '/healthz') {
        await pool.query('SELECT 1');
        return send(200, { ok: true });
      }
      if (!safeEqual(req.headers['x-backend-key'], process.env.BACKEND_PROXY_SECRET)) throw new HttpError(403, 'Truy cập bị từ chối.');
      const path = new URL(req.url, 'http://backend').pathname;
      if (!['GET','POST'].includes(req.method)) throw new HttpError(405, 'Phương thức không hỗ trợ.');
      if (req.method === 'POST') requireOrigin(req.headers.origin, origin);
      if (path === '/api/store/login' && req.method === 'POST') {
        // Persistent global throttle bounds password hashing and attempts against the single owner.
        await rateLimit(pool, 'login:global', 8, 300);
        const { username, password, otp } = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(256), otp: z.string().max(6).default('') }).strict().parse(await body(req));
        const { rows } = await pool.query('SELECT id,password_hash FROM owners WHERE username=$1', [username]);
        const dummy = 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
        if (!verifyPassword(password, rows[0]?.password_hash ?? dummy) || !rows[0]) throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
        const counter = totpSecret ? verifyTotp(totpSecret, otp) : null;
        if (totpSecret && counter === null) throw new HttpError(401, 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
        const value = token(); const csrf = token();
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (totpSecret) {
            const used = await client.query(`INSERT INTO mfa_used(owner_id,counter) VALUES($1,$2)
              ON CONFLICT(owner_id) DO UPDATE SET counter=excluded.counter WHERE mfa_used.counter<excluded.counter RETURNING counter`, [rows[0].id, counter]);
            if (!used.rowCount) throw new HttpError(401, 'Mã xác thực đã sử dụng. Hãy đợi mã tiếp theo.');
          }
          await client.query('DELETE FROM sessions WHERE expires_at<=now() OR token_hash=$1', [hashToken(sessionToken(req))]);
          await client.query("INSERT INTO sessions(token_hash,owner_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')", [hashToken(value), rows[0].id, csrf]);
          await client.query("INSERT INTO audit_events(owner_id,action,entity_id) VALUES($1,'session.login',$1)", [rows[0].id]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
        return send(200, { username, csrf }, { 'Set-Cookie': cookie(value, 28800) });
      }
      const user = await session(req);
      await rateLimit(pool, `api:${user.owner_id}`, 120);
      if (req.method === 'GET' && path === '/api/store/session') {
        const drafts = await pool.query("SELECT id,payload FROM drafts WHERE owner_id=$1 AND status='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 1", [user.owner_id]);
        const messages = await pool.query('SELECT role,content FROM (SELECT id,role,content FROM chat_messages WHERE owner_id=$1 ORDER BY id DESC LIMIT 30) t ORDER BY id', [user.owner_id]);
        return send(200, { username: user.username, csrf: user.csrf, draft: drafts.rows[0] ?? null, messages: messages.rows });
      }
      if (req.method !== 'POST') throw new HttpError(404, 'Không tìm thấy API.');
      if (!safeEqual(req.headers['x-csrf-token'], user.csrf)) throw new HttpError(403, 'Phiên xác nhận không hợp lệ. Hãy tải lại trang.');
      const data = await body(req);
      if (path === '/api/store/logout') {
        await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(sessionToken(req))]);
        return send(200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
      }
      if (path === '/api/store/chat') {
        stage = 'chat.rate_limit';
        const { message } = z.object({ message: z.string().trim().min(1).max(6000) }).strict().parse(data);
        await rateLimit(pool, `ai:minute:${user.owner_id}`, 10);
        await rateLimit(pool, `ai:day:${user.owner_id}`, dailyLimit, 86400);
        // Cross-process lock, not just an in-memory flag. Dedicated DB connection holds it during AI calls.
        if (active.has(user.owner_id)) throw new HttpError(409, 'Đang xử lý yêu cầu trước.');
        active.add(user.owner_id);
        let lock;
        let acquired = false;
        try {
        stage = 'chat.lock';
          lock = await pool.connect();
          const held = await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [`chat:${user.owner_id}`]);
          acquired = held.rows[0].acquired;
          if (!acquired) throw new HttpError(409, 'Đang xử lý yêu cầu trước.');
        stage = 'chat.ai';
        return send(200, await chatHandler(user.owner_id, message));
        } finally {
          try { if (acquired) await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`chat:${user.owner_id}`]); }
          finally { lock?.release(); active.delete(user.owner_id); }
        }
      }
      if (path === '/api/store/reports') return send(200, { report: await report(user.owner_id, data, pool) });
      if (path === '/api/store/confirm' || path === '/api/store/cancel') {
        const { id } = z.object({ id: z.uuid() }).strict().parse(data);
        if (path.endsWith('/confirm')) return send(200, await confirmDraft(user.owner_id, id, pool));
        const result = await pool.query("UPDATE drafts SET status='cancelled' WHERE id=$1 AND owner_id=$2 AND status='pending' RETURNING id", [id, user.owner_id]);
        if (!result.rowCount) throw new HttpError(409, 'Phiếu không còn chờ xác nhận.');
        await pool.query("INSERT INTO audit_events(owner_id,action,entity_id) VALUES($1,'draft.cancel',$2)", [user.owner_id, id]);
        return send(200, { ok: true });
      }
      throw new HttpError(404, 'Không tìm thấy API.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 422 : 503;
      if (status === 503) console.error(JSON.stringify({ requestId, event: 'request_failed', stage,
        aiProvider: ['openai','chatmock'].includes(process.env.AI_PROVIDER?.trim() || 'openai') ? process.env.AI_PROVIDER?.trim() || 'openai' : 'invalid',
        code: typeof error.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : error instanceof HttpError ? 'APPLICATION_ERROR' : 'UPSTREAM_OR_DATABASE' }));
      send(status, { error: error instanceof HttpError ? error.message : status === 422 ? 'Dữ liệu không hợp lệ.' : 'Dịch vụ tạm thời không khả dụng. Chưa thể xác nhận kết quả; hãy tải lại phiếu trước khi thử lại.', requestId }, status === 429 ? { 'Retry-After': '300' } : {});
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createStoreServer();
  if (process.env.NODE_ENV === 'production') await assertRuntimeRole();
  server.listen(Number(process.env.PORT ?? 4000), process.env.BACKEND_HOST ?? '127.0.0.1', () => console.log('Store backend ready'));
  async function shutdown() { server.close(async () => { await db.end(); process.exit(0); }); }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
