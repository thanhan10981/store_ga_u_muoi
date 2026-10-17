import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HttpError, normalize, parseReceipt, querySchema } from './domain.mjs';

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10,
  connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
db.on('error', () => console.error('Database connection interrupted'));

export async function assertRuntimeRole(pool = db) {
  const { rows } = await pool.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,
    has_table_privilege(current_user,'owners','UPDATE') OR
    has_table_privilege(current_user,'receipts','UPDATE') OR
    has_table_privilege(current_user,'receipts','DELETE') OR
    has_table_privilege(current_user,'audit_events','UPDATE') OR
    has_table_privilege(current_user,'audit_events','DELETE') OR
    has_schema_privilege(current_user,'public','CREATE') AS excessive
    FROM pg_roles WHERE rolname=current_user`);
  if (!rows[0] || Object.values(rows[0]).some(Boolean)) throw new Error('Backend runtime DB role has excessive privileges; use the restricted store_app role.');
}

export async function confirmDraft(ownerId, id, pool = db) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize all inventory writes for a store, including cross-draft races.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('store-write'),hashtext($1))", [ownerId]);
    const { rows } = await client.query('SELECT * FROM drafts WHERE id=$1 AND owner_id=$2 FOR UPDATE', [id, ownerId]);
    const draft = rows[0];
    if (!draft) throw new HttpError(404, 'Không tìm thấy phiếu.');
    if (draft.status === 'confirmed') {
      const old = await client.query('SELECT id FROM receipts WHERE draft_id=$1 AND owner_id=$2', [id, ownerId]);
      await client.query('COMMIT');
      return { receiptId: old.rows[0].id, alreadyConfirmed: true };
    }
    if (draft.status !== 'pending' || new Date(draft.expires_at) <= new Date()) throw new HttpError(409, 'Phiếu đã hủy hoặc hết hạn. Hãy tạo phiếu mới.');
    const data = parseReceipt(draft.payload);
    const receiptId = randomUUID();
    await client.query('INSERT INTO receipts(id,owner_id,draft_id,kind,business_date,note) VALUES($1,$2,$3,$4,$5,$6)', [receiptId, ownerId, id, data.kind, data.date, data.note]);
    for (const line of data.lines) {
      const product = await client.query(`INSERT INTO products(id,owner_id,name,unit,name_key,unit_key) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(owner_id,name_key,unit_key) DO UPDATE SET name=products.name RETURNING id`,
      [randomUUID(), ownerId, line.name, line.unit, normalize(line.name), normalize(line.unit)]);
      const productId = product.rows[0].id;
      if (data.kind === 'sale' || data.kind === 'waste') {
        // Verify historical as well as present stock, including backdated entries.
        const stock = await client.query(`WITH daily AS (
          SELECT r.business_date, sum(CASE r.kind WHEN 'purchase' THEN l.quantity WHEN 'sale' THEN -l.quantity WHEN 'waste' THEN -l.quantity ELSE 0 END) AS delta
          FROM receipt_lines l JOIN receipts r ON r.id=l.receipt_id
          WHERE r.owner_id=$1 AND l.product_id=$2 GROUP BY r.business_date
          UNION ALL SELECT $3::date, -$4::numeric
        ), balances AS (SELECT business_date, sum(sum(delta)) OVER (ORDER BY business_date) AS balance FROM daily GROUP BY business_date)
        SELECT min(balance) AS minimum FROM balances`, [ownerId, productId, data.date, line.quantity]);
        if (Number(stock.rows[0].minimum) < 0) throw new HttpError(409, `Không đủ tồn kho: ${line.name} (${line.unit}). Kiểm tra nhập hàng và ngày giao dịch.`);
      }
      await client.query('INSERT INTO receipt_lines(receipt_id,product_id,quantity,unit_price) VALUES($1,$2,$3,$4)', [receiptId, productId, line.quantity, line.unitPrice]);
    }
    await client.query("UPDATE drafts SET status='confirmed' WHERE id=$1", [id]);
    await client.query("INSERT INTO audit_events(owner_id,action,entity_id) VALUES($1,'receipt.confirm',$2)", [ownerId, receiptId]);
    await client.query('COMMIT');
    return { receiptId, alreadyConfirmed: false };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function report(ownerId, input, pool = db) {
  const q = querySchema.parse(input);
  const args = [ownerId, q.from, q.to, q.item];
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const totals = await client.query(`SELECT r.kind, coalesce(sum(l.amount),0)::text AS amount, count(DISTINCT r.id)::int AS receipts
      FROM receipts r JOIN receipt_lines l ON l.receipt_id=r.id JOIN products p ON p.id=l.product_id
      WHERE r.owner_id=$1 AND r.business_date BETWEEN $2::date AND $3::date AND ($4='' OR position(lower($4) in lower(p.name))>0)
      GROUP BY r.kind`, args);
    const series = await client.query(`SELECT to_char(date_trunc($5,r.business_date),'YYYY-MM-DD') AS period, r.kind, sum(l.amount)::text AS amount
      FROM receipts r JOIN receipt_lines l ON l.receipt_id=r.id JOIN products p ON p.id=l.product_id
      WHERE r.owner_id=$1 AND r.business_date BETWEEN $2::date AND $3::date AND ($4='' OR position(lower($4) in lower(p.name))>0)
      GROUP BY 1,r.kind ORDER BY 1,r.kind`, [...args, q.bucket]);
    const products = await client.query(`SELECT p.name,p.unit,r.kind,sum(l.quantity)::text AS quantity,sum(l.amount)::text AS amount
      FROM receipts r JOIN receipt_lines l ON l.receipt_id=r.id JOIN products p ON p.id=l.product_id
      WHERE r.owner_id=$1 AND r.business_date BETWEEN $2::date AND $3::date AND ($4='' OR position(lower($4) in lower(p.name))>0)
      GROUP BY p.id,r.kind ORDER BY sum(l.amount) DESC,p.name LIMIT 101`, args);
    const inventory = await client.query(`SELECT p.name,p.unit,sum(CASE r.kind WHEN 'purchase' THEN l.quantity WHEN 'sale' THEN -l.quantity WHEN 'waste' THEN -l.quantity ELSE 0 END)::text AS stock
      FROM products p JOIN receipt_lines l ON l.product_id=p.id JOIN receipts r ON r.id=l.receipt_id
      WHERE p.owner_id=$1 AND r.owner_id=$1 AND r.business_date<=$2::date AND r.kind<>'expense' AND ($3='' OR position(lower($3) in lower(p.name))>0)
      GROUP BY p.id ORDER BY p.name,p.unit LIMIT 501`, [ownerId, q.to, q.item]);
    await client.query('COMMIT');
    const sum = kind => totals.rows.find(r => r.kind === kind)?.amount ?? '0';
    return { query: q, revenue: sum('sale'), purchases: sum('purchase'), expenses: sum('expense'),
      cashDifference: (BigInt(sum('sale')) - BigInt(sum('purchase')) - BigInt(sum('expense'))).toString(),
      totals: totals.rows, series: series.rows, products: products.rows.slice(0, 100), inventory: inventory.rows.slice(0, 500),
      truncated: { products: products.rows.length > 100, inventory: inventory.rows.length > 500 },
      note: 'Chênh lệch thu chi không phải lợi nhuận. Chưa tính giá vốn, thuế, công nợ, lương nếu chưa nhập. Tồn kho theo đúng tên + đơn vị, không tự quy đổi con/kg hoặc nguyên liệu/thành phẩm.' };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
