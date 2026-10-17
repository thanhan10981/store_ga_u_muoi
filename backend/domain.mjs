import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
}, 'Ngày không hợp lệ');
export const lineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(30),
  quantity: z.number().positive().max(1000000).refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001),
  unitPrice: z.number().int().min(0).max(1000000000),
}).strict();
export const receiptSchema = z.object({
  kind: z.enum(['purchase', 'sale', 'waste', 'expense']),
  date,
  note: z.string().trim().max(500),
  lines: z.array(lineSchema).min(1).max(50),
}).strict().refine(r => r.lines.reduce((n, l) => n + lineTotal(l), 0) <= 1000000000000, 'Tổng phiếu quá lớn')
  .refine(r => r.kind !== 'waste' || r.lines.every(l => l.unitPrice === 0), 'Hao hụt phải có đơn giá 0');
export const querySchema = z.object({ from: date, to: date, bucket: z.enum(['day', 'month', 'year']), item: z.string().trim().max(120) }).strict()
  .refine(q => q.from <= q.to && (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 3660, 'Khoảng ngày tối đa 10 năm');
export function lineTotal(l) { return Math.round(Math.round(l.quantity * 1000) * l.unitPrice / 1000); }
export const normalize = value => value.normalize('NFKC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
export function todayVN() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function parseReceipt(value) {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(422, 'Phiếu chưa hợp lệ. Kiểm tra tên, đơn vị, số lượng, đơn giá và ngày.');
  if (parsed.data.date > todayVN()) throw new HttpError(422, 'Không ghi nhận giao dịch trong tương lai.');
  return parsed.data;
}
export function requireOrigin(actual, expected) {
  if (actual !== expected) throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.');
}
