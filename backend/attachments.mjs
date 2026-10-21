import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import { HttpError } from './domain.mjs';

export const CHAT_BODY_LIMIT = 4 * 1024 * 1024;
export const FILE_LIMIT = 2 * 1024 * 1024;
export const TOTAL_FILE_LIMIT = 2800000;
const attachmentSchema = z.object({
  name: z.string().min(1).max(160).refine(v => !/[\\/\x00-\x1f\x7f]/.test(v)),
  data: z.string().max(Math.ceil(FILE_LIMIT / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
export const chatRequestSchema = z.object({
  message: z.string().trim().max(6000).default(''),
  attachments: z.array(attachmentSchema).max(3).default([]),
}).strict().refine(v => v.message.length > 0 || v.attachments.length > 0);

export function validateAttachments(files) {
  let total = 0;
  for (const file of files) {
    const bytes = Buffer.from(file.data, 'base64');
    if (!bytes.length || bytes.length > FILE_LIMIT) throw new HttpError(413, 'Mỗi tệp phải có nội dung và tối đa 2 MB.');
    if (bytes.toString('base64') !== file.data) throw new HttpError(422, 'Dữ liệu tệp không hợp lệ.');
    if (!/\.(png|jpe?g|webp|pdf|xlsx|docx|csv|txt)$/i.test(file.name)) throw new HttpError(415, 'Chỉ hỗ trợ PNG, JPG, WEBP, PDF, XLSX, DOCX, CSV và TXT.');
    total += bytes.length;
  }
  if (total > TOTAL_FILE_LIMIT) throw new HttpError(413, 'Tổng tệp đính kèm tối đa 2,8 MB mỗi tin nhắn.');
  return files;
}

let active = 0;
export async function prepareAttachments(files) {
  if (!files.length) return [];
  validateAttachments(files);
  if (active >= 2) throw new HttpError(429, 'Đang đọc tài liệu khác. Hãy thử lại sau ít giây.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./attachment-worker.mjs', import.meta.url), { workerData: files, resourceLimits: { maxOldGenerationSizeMb: 128 } });
      let settled = false;
      const finish = (error, value, abort = false) => {
        if (settled) return; settled = true; clearTimeout(timer);
        // Let successful parsers release native image/PDF resources normally.
        if (abort) void worker.terminate();
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new HttpError(422, 'Tệp quá phức tạp hoặc mất quá lâu để đọc. Hãy chia nhỏ tệp.'), null, true), 20000);
      worker.once('message', value => value.error ? finish(new HttpError(422, value.error)) : finish(null, value.parts));
      worker.once('error', () => finish(new HttpError(422, 'Không đọc được tệp. Kiểm tra định dạng hoặc chia nhỏ tài liệu.')));
      worker.once('exit', () => { if (!settled) finish(new HttpError(422, 'Bộ đọc tệp đã dừng. Hãy thử tệp nhỏ hơn.')); });
    });
  } finally { active--; }
}

export function attachmentMessage(message, files) {
  return `${message || 'Hãy đọc các tệp đính kèm, tóm tắt và hỏi lại thông tin còn thiếu trước khi lập phiếu.'}${files.length ? `\n[Đính kèm: ${files.map(file => file.name).join(', ')} — nội dung tệp chỉ được xử lý trong lượt gửi này]` : ''}`;
}
