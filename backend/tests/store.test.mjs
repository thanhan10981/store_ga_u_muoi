import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { db, assertRuntimeRole, confirmDraft, report } from '../db.mjs';
import { hashPassword, verifyPassword, totp, verifyTotp, rateLimit } from '../security.mjs';
import { parseReceipt, lineTotal, todayVN } from '../domain.mjs';
import { createStoreServer } from '../server.mjs';
import { chat } from '../ai.mjs';
import { provisionRuntime } from '../../deploy/render-runtime.mjs';
import { proposeInventory, inventoryCatalog } from '../inventory.mjs';

const pg = new PGlite();
const pool = {
  query: (...args) => pg.query(...args),
  connect: async () => ({ query: (...args) => pg.query(...args), release() {} }),
};
const owner = randomUUID(); const other = randomUUID();
let server; let url;
const secret = 'test-only-backend-secret-32-characters-long';
const origin = 'http://127.0.0.1:3000';
const mfaSecret = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const password = 'test-only-long-password';
const data = (kind, quantity, unitPrice = 120000, date = todayVN()) => ({ kind, date, note: '', lines: [{ name: 'Gà ủ muối', unit: 'con', quantity, unitPrice }] });
async function draft(payload, ownerId = owner) {
  const id = randomUUID(); await pg.query('INSERT INTO drafts(id,owner_id,payload) VALUES($1,$2,$3)', [id, ownerId, JSON.stringify(payload)]); return id;
}
async function request(path, body, headers = {}, method = 'POST') {
  return fetch(`${url}/api/store/${path}`, { method, headers: { 'x-backend-key': secret, origin, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
before(async () => {
  await pg.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  await pg.query('INSERT INTO owners(id,username,password_hash) VALUES($1,$2,$3),($4,$5,$3)', [owner, 'owner', hashPassword(password), other, 'other']);
  process.env.NODE_ENV = 'test'; process.env.PGHOST = 'test'; process.env.APP_ORIGIN = origin;
  process.env.BACKEND_PROXY_SECRET = secret; process.env.OWNER_TOTP_SECRET = mfaSecret;
  server = createStoreServer({ database: pool, chatHandler: async () => ({ answer: 'simulated AI' }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await pg.close(); await db.end(); });

test('reject invalid quantities, missing prices, impossible dates and future receipts', () => {
  for (const payload of [data('purchase', -2), data('purchase', 0), data('purchase', 1.0001), data('purchase', 1, 1.5), data('purchase', 1, 1, '2026-02-30'), data('purchase', 1, 1, '2999-01-01'), data('waste', 1, 5)]) assert.throws(() => parseReceipt(payload));
  const missing = data('purchase', 1); delete missing.lines[0].unitPrice; assert.throws(() => parseReceipt(missing));
  assert.equal(lineTotal({ quantity: 1.125, unitPrice: 100 }), 113);
});
test('password hashing and MFA accept correct credentials and reject incorrect ones', () => {
  const hash = hashPassword(password);
  assert.ok(verifyPassword(password, hash)); assert.equal(verifyPassword('incorrect', hash), false);
  // RFC 6238 SHA1 vector: at t=59, the 8-digit code is 94287082 (6-digit suffix 287082).
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(rfcSecret, 1), '287082');
  assert.equal(verifyTotp(rfcSecret, '287082', 59000), 1);
  assert.equal(verifyTotp(rfcSecret, '287082', 150000), null);
});
test('unconfirmed drafts never affect reports; confirmation is idempotent and audited', async () => {
  const id = await draft(data('purchase', 30));
  const query = { from: todayVN(), to: todayVN(), bucket: 'day', item: '' };
  assert.equal((await report(owner, query, pool)).purchases, '0');
  const first = await confirmDraft(owner, id, pool);
  const second = await confirmDraft(owner, id, pool);
  assert.equal(first.receiptId, second.receiptId); assert.equal(second.alreadyConfirmed, true);
  assert.equal((await report(owner, query, pool)).purchases, '3600000');
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM audit_events WHERE action='receipt.confirm'")).rows[0].n, 1);
});
test('sales decrement stock; overdraft rolls back the whole receipt, including earlier lines', async () => {
  await confirmDraft(owner, await draft(data('sale', 5, 180000)), pool);
  const invalid = data('sale', 10, 180000); invalid.lines.push({ name: 'Gà ủ muối', unit: 'con', quantity: 20, unitPrice: 180000 });
  const id = await draft(invalid);
  await assert.rejects(confirmDraft(owner, id, pool), /Không đủ tồn kho/);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM receipts WHERE draft_id=$1', [id])).rows[0].n, 0);
  assert.equal((await pg.query('SELECT status FROM drafts WHERE id=$1', [id])).rows[0].status, 'pending');
  const r = await report(owner, { from: todayVN(), to: todayVN(), bucket: 'month', item: '' }, pool);
  assert.equal(r.revenue, '900000'); assert.equal(r.inventory[0].stock, '25.000'); assert.equal(r.cashDifference, '-2700000');
});
test('cannot backdate a sale before its stock arrived, or mix units silently', async () => {
  const previous = new Date(Date.parse(todayVN()) - 86400000).toISOString().slice(0,10);
  await assert.rejects(confirmDraft(owner, await draft(data('sale', 1, 180000, previous)), pool), /Không đủ tồn kho/);
  const wrongUnit = data('sale', 1, 180000); wrongUnit.lines[0].unit = 'kg';
  await assert.rejects(confirmDraft(owner, await draft(wrongUnit), pool), /Không đủ tồn kho/);
});
test('owners cannot read another store or confirm its drafts; expired/cancelled drafts cannot be confirmed', async () => {
  const foreign = await draft(data('purchase', 3), other);
  await assert.rejects(confirmDraft(owner, foreign, pool), /Không tìm thấy/);
  assert.equal((await report(other, { from: todayVN(), to: todayVN(), bucket: 'year', item: '' }, pool)).purchases, '0');
  for (const state of ['expired','cancelled']) {
    const id = await draft(data('purchase', 1));
    await pg.query(state === 'expired' ? "UPDATE drafts SET expires_at=now()-interval '1 second' WHERE id=$1" : "UPDATE drafts SET status='cancelled' WHERE id=$1", [id]);
    await assert.rejects(confirmDraft(owner, id, pool), /hủy hoặc hết hạn/);
  }
});
test('report filtering treats SQL-looking text as data', async () => {
  const r = await report(owner, { from: todayVN(), to: todayVN(), bucket: 'day', item: "' OR 1=1; --" }, pool);
  assert.equal(r.revenue, '0'); assert.deepEqual(r.inventory, []);
});
test('persistent throttle survives subsequent calls and rolls over windows', async () => {
  await rateLimit(pool, 'test', 1); await assert.rejects(rateLimit(pool, 'test', 1), /vượt hạn mức/);
  await pg.query("UPDATE rate_limits SET window_start=now()-interval '2 minutes' WHERE key='test'");
  await rateLimit(pool, 'test', 1);
});
test('HTTP: proxy authentication, origin, login/MFA, CSRF, session revocation and draft access', async () => {
  const health = await fetch(`${url}/healthz`);
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });
  assert.equal((await request('session', null, {}, 'GET')).status, 401);
  assert.equal((await request('session', null, { 'x-backend-key': 'wrong' }, 'GET')).status, 403);
  assert.equal((await request('login', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('login', { username: 'owner', password, otp: 'bad' })).status, 401);
  const otp = totp(mfaSecret, Math.floor(Date.now() / 30000));
  const login = await request('login', { username: 'owner', password, otp });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const session = await login.json(); const auth = { cookie: cookie.split(';')[0], 'x-csrf-token': session.csrf };
  assert.equal((await request('login', { username: 'owner', password, otp })).status, 401, 'MFA code cannot be replayed');
  assert.equal((await request('session', null, auth, 'GET')).status, 200);
  assert.equal((await request('reports', {}, { cookie: auth.cookie })).status, 403);
  const attachment = { name: 'invoice.txt', data: Buffer.from('Ga 30 con 120000').toString('base64') };
  assert.equal((await request('chat', { attachments: [attachment] }, { cookie: auth.cookie })).status, 403);
  assert.equal((await request('chat', { attachments: [attachment] }, auth)).status, 200);
  assert.equal((await request('chat', { attachments: [{ ...attachment, name: 'script.exe' }] }, auth)).status, 415);
  assert.equal((await request('chat', { attachments: [{ ...attachment, name: '../bad.txt' }] }, auth)).status, 422);
  assert.equal((await request('chat', { message: 'hello' }, auth)).status, 200);
  const id = await draft(data('purchase', 1), other);
  assert.equal((await request('confirm', { id }, auth)).status, 404);
  assert.equal((await request('logout', {}, auth)).status, 200);
  assert.equal((await request('session', null, auth, 'GET')).status, 401);
});
test('AI plans cannot write receipts; invalid or incomplete output fails closed, edits invalidate older drafts', async () => {
  const before = (await pg.query('SELECT count(*)::int AS n FROM receipts')).rows[0].n;
  const simulate = plan => ({ pool, client: { responses: { create: async () => ({ status: 'completed', output_text: JSON.stringify(plan) }) } } });
  const valid = { action: 'draft', answer: 'Đã lưu (model claim must be ignored)', receipt: data('purchase', 7), query: null };
  const first = await chat(owner, 'Nhập 7 con gà giá 120k/con', simulate(valid));
  assert.match(first.answer, /phiếu nháp/); assert.doesNotMatch(first.answer, /Đã lưu/);
  const second = await chat(owner, 'Sửa thành 8 con', simulate({ ...valid, receipt: data('purchase', 8) }));
  assert.equal(second.draft.payload.lines[0].quantity, 8);
  await assert.rejects(confirmDraft(owner, first.draft.id, pool), /hủy hoặc hết hạn/);
  const missing = structuredClone(valid); delete missing.receipt.lines[0].unitPrice;
  await assert.rejects(chat(owner, 'Thiếu giá', simulate(missing)), /không hợp lệ/);
  await assert.rejects(chat(owner, 'DROP TABLE receipts', simulate({ action: 'sql', sql: 'DROP TABLE receipts' })), /không hợp lệ/);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM receipts')).rows[0].n, before);
});
test('owner inventory edits require confirmation, preserve finance, reject stale drafts and retain deletion history', async () => {
  const receipt = data('purchase',10); receipt.lines[0].name = 'Kho kiểm kê';
  await confirmDraft(owner,await draft(receipt),pool);
  const product = (await inventoryCatalog(owner,pool)).find(p => p.name === 'Kho kiểm kê');
  const input = { productId: product.id, operation: 'set_stock', quantity: 7, name: null, reason: 'Chủ cửa hàng kiểm kê lại' };
  const payload = await proposeInventory(owner,input,pool);
  assert.equal(Number((await inventoryCatalog(owner,pool,product.id))[0].stock),10);
  const id = await draft(payload);
  const confirmed = await confirmDraft(owner,id,pool);
  assert.equal((await confirmDraft(owner,id,pool)).receiptId,confirmed.receiptId);
  assert.equal(Number((await inventoryCatalog(owner,pool,product.id))[0].stock),7);
  await assert.rejects(proposeInventory(other,input,pool),/Không tìm thấy/);
  await assert.rejects(proposeInventory(owner,{ ...input,quantity:-1 },pool));
  const obsolete = await draft(await proposeInventory(owner,{ ...input,quantity:20 },pool));
  const sale = data('sale',3,180000); sale.lines[0].name = 'Kho kiểm kê';
  await confirmDraft(owner,await draft(sale),pool);
  await assert.rejects(confirmDraft(owner,obsolete,pool),/Kho đã thay đổi/);
  assert.equal(Number((await inventoryCatalog(owner,pool,product.id))[0].stock),4);
  const renamed = await proposeInventory(owner,{ ...input,operation:'rename_product',quantity:null,name:'Kho tên mới' },pool);
  await confirmDraft(owner,await draft(renamed),pool);
  assert.equal((await inventoryCatalog(owner,pool,product.id))[0].name,'Kho tên mới');
  const q = { from:todayVN(),to:todayVN(),bucket:'day',item:'' };
  const before = await report(owner,q,pool);
  const remove = await proposeInventory(owner,{ ...input,operation:'archive_product',quantity:null },pool);
  const removeId = await draft(remove);
  await confirmDraft(owner,removeId,pool);
  const after = await report(owner,q,pool);
  assert.equal(after.revenue,before.revenue); assert.equal(after.purchases,before.purchases);
  assert.equal(after.inventory.some(p => p.id === product.id),false);
  assert.equal((await inventoryCatalog(owner,pool,product.id))[0].archived,true);
  const archivedPurchase = data('purchase',1); archivedPurchase.lines[0].name = 'Kho tên mới';
  await assert.rejects(confirmDraft(owner,await draft(archivedPurchase),pool),/khôi phục/);
  await confirmDraft(owner,await draft(await proposeInventory(owner,{ ...input,operation:'restore_product',quantity:null },pool)),pool);
  const restored = (await inventoryCatalog(owner,pool,product.id))[0];
  assert.equal(restored.archived,false); assert.equal(Number(restored.stock),0);
  const history = await pg.query('SELECT before_state,after_state FROM inventory_changes WHERE draft_id=$1',[removeId]);
  assert.equal(Number(history.rows[0].before_state.stock),4); assert.equal(history.rows[0].after_state.archived,true);
  const cancelled = await draft(await proposeInventory(owner,input,pool));
  await pg.query("UPDATE drafts SET status='cancelled' WHERE id=$1",[cancelled]);
  await assert.rejects(confirmDraft(owner,cancelled,pool),/hủy/);
});

test('AI inventory plan is a proposal, cannot apply changes or affect another owner', async () => {
  const product = (await inventoryCatalog(owner,pool)).find(p => !p.archived);
  const before = product.stock;
  const inventory = { productId:product.id,operation:'set_stock',quantity:9,name:null,reason:'Kiểm kê theo yêu cầu chủ' };
  const plan = { action:'inventory',inventory,receipt:null,query:null,answer:'Đã sửa kho' };
  const options = { pool, client:{ responses:{ create:async () => ({status:'completed',output_text:JSON.stringify(plan)}) } } };
  const result = await chat(owner,'Sửa tồn mặt hàng thành 9',options);
  assert.match(result.answer,/chưa áp dụng/);
  assert.equal((await inventoryCatalog(owner,pool,product.id))[0].stock,before);
  await assert.rejects(chat(other,'Sửa kho',options),/Không tìm thấy/);
});

test('deployed runtime grants permit confirmation/report and prohibit changing credentials or posted ledger', async () => {
  await assert.rejects(assertRuntimeRole(pool), /excessive privileges/);
  const script = await readFile(new URL('../../deploy/02-runtime-role.sh', import.meta.url), 'utf8');
  const grants = script.split("<<'SQL'\n")[1].split('\nSQL')[0].split('\n').slice(1).join('\n');
  await pg.exec('CREATE ROLE store_app NOSUPERUSER NOCREATEDB NOCREATEROLE;');
  // PGlite uses a different database name; exercise the exact table/schema grants.
  await pg.exec(grants.replace(/REVOKE ALL ON DATABASE store FROM PUBLIC;|GRANT CONNECT ON DATABASE store TO store_app;/g, ''));
  await assert.rejects(provisionRuntime(pool, 'short'), /32 characters/);
  // Existing-role path is idempotent, including safe quoting of a password with apostrophes.
  await provisionRuntime(pool, "test-only-long-password-with-'quotes'-123456789");
  const managedPool = { connect: async () => ({ release() {}, query: async (sql, args) => {
    if (/^ALTER ROLE store_app\b.*\bNOSUPERUSER\b/.test(sql)) throw Object.assign(new Error('Managed admin cannot alter SUPERUSER attribute'), { code: '42501' });
    return pg.query(sql, args);
  } }) };
  await provisionRuntime(managedPool, 'test-only-rotated-password-1234567890');
  const id = await draft(data('purchase', 1));
  await pg.exec('SET ROLE store_app');
  try {
    await assertRuntimeRole(pool);
    assert.ok((await confirmDraft(owner, id, pool)).receiptId);
    assert.ok((await report(owner, { from: todayVN(), to: todayVN(), bucket: 'day', item: '' }, pool)).purchases);
    const product = (await inventoryCatalog(owner,pool)).find(p => !p.archived);
    const proposed = await proposeInventory(owner,{ productId:product.id,operation:'set_stock',quantity:6,name:null,reason:'Kiểm kê' },pool);
    await confirmDraft(owner,await draft(proposed),pool);
    await assert.rejects(pg.query("UPDATE owners SET password_hash='tampered' WHERE id=$1", [owner]), /permission denied/);
    await assert.rejects(pg.query('DELETE FROM receipts'), /permission denied/);
    await assert.rejects(pg.query("UPDATE receipts SET note='tampered'"), /permission denied/);
    await assert.rejects(pg.query('DELETE FROM audit_events'), /permission denied/);
    await assert.rejects(pg.query('DELETE FROM inventory_changes'), /permission denied/);
    await assert.rejects(pg.query("UPDATE inventory_changes SET reason='tampered'"), /permission denied/);
    await assert.rejects(pg.query("UPDATE products SET unit='kg'"), /permission denied/);
  } finally { await pg.exec('RESET ROLE'); }
});
