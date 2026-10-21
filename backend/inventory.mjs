import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, normalize, todayVN } from './domain.mjs';

export const inventoryRequest = z.object({
  operation: z.enum(['set_stock','rename_product','archive_product','restore_product']),
  productId: z.uuid(), quantity: z.number().min(0).max(1000000000).refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < .00001).nullable(),
  name: z.string().trim().max(120).nullable(), reason: z.string().trim().min(1).max(500),
}).strict();

export async function inventoryCatalog(ownerId, pool, productId = null) {
  return (await pool.query(`SELECT p.id,p.name,p.unit,p.archived,p.revision::text,
    (coalesce((SELECT sum(CASE r.kind WHEN 'purchase' THEN l.quantity WHEN 'sale' THEN -l.quantity WHEN 'waste' THEN -l.quantity ELSE 0 END)
      FROM receipt_lines l JOIN receipts r ON r.id=l.receipt_id WHERE l.product_id=p.id AND r.owner_id=$1),0)
     +coalesce((SELECT sum(c.delta) FROM inventory_changes c WHERE c.product_id=p.id AND c.owner_id=$1),0))::text AS stock
    FROM products p WHERE p.owner_id=$1 AND ($2::uuid IS NULL OR p.id=$2) ORDER BY p.archived,p.name,p.unit LIMIT 201`, [ownerId, productId])).rows;
}

export async function proposeInventory(ownerId, input, pool) {
  const request = inventoryRequest.parse(input);
  const before = (await inventoryCatalog(ownerId, pool, request.productId))[0];
  if (!before) throw new HttpError(404, 'Không tìm thấy mặt hàng của cửa hàng.');
  if (request.operation === 'restore_product' ? !before.archived : before.archived) throw new HttpError(409, 'Trạng thái mặt hàng không phù hợp. Hãy kiểm tra kho và tạo đề xuất mới.');
  const after = { ...before };
  if (request.operation === 'set_stock') {
    if (request.quantity === null) throw new HttpError(422, 'Cần số tồn kho mới rõ ràng.');
    after.stock = request.quantity.toFixed(3);
  }
  if (request.operation === 'rename_product') {
    if (!request.name) throw new HttpError(422, 'Cần tên mặt hàng mới.');
    const conflict = await pool.query('SELECT id FROM products WHERE owner_id=$1 AND name_key=$2 AND unit_key=$3 AND id<>$4', [ownerId, normalize(request.name), normalize(before.unit), before.id]);
    if (conflict.rows.length) throw new HttpError(409, 'Tên và đơn vị đã thuộc mặt hàng khác. Không tự gộp kho.');
    after.name = request.name;
  }
  if (request.operation === 'archive_product') { after.stock = '0.000'; after.archived = true; }
  if (request.operation === 'restore_product') after.archived = false;
  return { type: 'inventory', ...request, before, after, date: todayVN() };
}

export async function confirmInventory(ownerId, draft, client) {
  const payload = draft.payload;
  if (payload.date !== todayVN()) throw new HttpError(409, 'Đề xuất kho thuộc ngày trước. Hãy tạo lại để kiểm tra số tồn mới nhất.');
  const fresh = await proposeInventory(ownerId, payloadInput(payload), client);
  const same = (a,b) => b && ['id','name','unit','archived','revision','stock'].every(key => a[key] === b[key]);
  if (!same(fresh.before,payload.before) || !same(fresh.after,payload.after))
    throw new HttpError(409, 'Kho đã thay đổi từ lúc lập đề xuất. Hãy yêu cầu tạo lại, chưa có thay đổi nào được áp dụng.');
  const id = randomUUID();
  const delta = (Number(fresh.after.stock) - Number(fresh.before.stock)).toFixed(3);
  try {
    await client.query('UPDATE products SET name=$1,name_key=$2,archived=$3,revision=revision+1 WHERE id=$4 AND owner_id=$5', [fresh.after.name, normalize(fresh.after.name), fresh.after.archived, fresh.before.id, ownerId]);
  } catch (error) { if (error.code === '23505') throw new HttpError(409, 'Tên mặt hàng đã tồn tại. Hãy tạo lại đề xuất.'); throw error; }
  await client.query(`INSERT INTO inventory_changes(id,owner_id,draft_id,product_id,business_date,delta,operation,before_state,after_state,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id,ownerId,draft.id,fresh.before.id,fresh.date,delta,fresh.operation,JSON.stringify(fresh.before),JSON.stringify(fresh.after),fresh.reason]);
  await client.query("UPDATE drafts SET status='confirmed' WHERE id=$1 AND owner_id=$2", [draft.id,ownerId]);
  await client.query('INSERT INTO audit_events(owner_id,action,entity_id) VALUES($1,$2,$3)', [ownerId,`inventory.${fresh.operation}`,id]);
  return { receiptId: id, changeId: id, alreadyConfirmed: false, operation: fresh.operation };
}

function payloadInput(payload) {
  return { operation: payload.operation, productId: payload.productId, quantity: payload.quantity, name: payload.name, reason: payload.reason };
}
