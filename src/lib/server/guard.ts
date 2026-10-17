import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { CHAT_MODEL_IDS } from "../models";
import { MAX_ASSISTANT_CHARS, MAX_BODY_BYTES, MAX_CONCURRENT_REQUESTS, MAX_CONTEXT_CHARS, MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, MAX_REQUESTS_PER_MINUTE } from "../limits";

const messageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }).strict(),
  z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(MAX_ASSISTANT_CHARS) }).strict(),
]);
const bodySchema = z.object({ messages: z.array(messageSchema).min(1).max(MAX_HISTORY_MESSAGES), model: z.enum(CHAT_MODEL_IDS).optional() }).strict();

export function guardLocal(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  let hostUrl: URL;
  try { hostUrl = new URL(`http://${host}`); } catch { throw new AppError("LOCAL_ONLY", "Ứng dụng chỉ nhận yêu cầu trên máy local.", 403); }
  const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
  // Next.js can normalize request.url to localhost even when the browser uses
  // 127.0.0.1. Validate both independently, and compare Origin with the actual Host.
  if (!local.has(url.hostname) || !local.has(hostUrl.hostname) || hostUrl.host !== host.toLowerCase()) {
    throw new AppError("LOCAL_ONLY", "Bản này chỉ hoạt động trên localhost. Cần xác thực và hạn mức trước khi triển khai công khai.", 403);
  }
  const origin = request.headers.get("origin");
  if ((origin && origin !== `${url.protocol}//${hostUrl.host}`) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("FORBIDDEN_ORIGIN", "Yêu cầu từ website khác đã bị từ chối.", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("INVALID_CONTENT_TYPE", "Yêu cầu phải có định dạng JSON.", 415);
  }
}

export async function readChatRequest(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) throw new AppError("BODY_TOO_LARGE", "Dữ liệu gửi lên vượt quá 100 KB.", 413);
  if (!request.body) throw new AppError("INVALID_INPUT", "Thiếu nội dung tin nhắn.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AppError("BODY_TOO_LARGE", "Dữ liệu gửi lên vượt quá 100 KB.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new AppError("INVALID_INPUT", "Dữ liệu JSON không hợp lệ."); }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "Tin nhắn không hợp lệ: tối đa 6.000 ký tự mỗi câu hỏi và 20 tin trong ngữ cảnh.");
  const { messages } = parsed.data;
  if (messages[0].role !== "user" || messages.at(-1)?.role !== "user" || messages.some((m, i) => i > 0 && m.role === messages[i - 1].role)) {
    throw new AppError("INVALID_HISTORY", "Lịch sử phải xen kẽ người dùng và AI, bắt đầu và kết thúc bằng người dùng.");
  }
  if (messages.reduce((sum, m) => sum + m.content.length, 0) > MAX_CONTEXT_CHARS) throw new AppError("CONTEXT_TOO_LARGE", "Ngữ cảnh vượt quá 24.000 ký tự.", 413);
  return { messages, model: parsed.data.model };
}

type Budget = { timestamps: number[]; active: number };
const globalState = globalThis as typeof globalThis & { machBudget?: Budget };
const budget = globalState.machBudget ??= { timestamps: [], active: 0 };

export function acquireRequest() {
  const now = Date.now();
  budget.timestamps = budget.timestamps.filter((t) => now - t < 60_000);
  if (budget.timestamps.length >= MAX_REQUESTS_PER_MINUTE) throw new AppError("LOCAL_RATE_LIMIT", "Đã đạt 10 yêu cầu/phút trên ứng dụng local. Vui lòng đợi khoảng một phút.", 429);
  if (budget.active >= MAX_CONCURRENT_REQUESTS) throw new AppError("BUSY", "Ứng dụng đang xử lý 2 yêu cầu. Hãy đợi câu trả lời hiện tại hoàn tất.", 429);
  budget.timestamps.push(now);
  budget.active++;
  let released = false;
  return () => { if (!released) { released = true; budget.active--; } };
}
