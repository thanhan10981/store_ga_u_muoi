import OpenAI from 'openai';
import { HttpError } from './domain.mjs';

export function storeAIConfig(env = process.env) {
  const provider = env.AI_PROVIDER?.trim() || 'openai';
  if (!['openai', 'chatmock'].includes(provider)) throw new HttpError(503, 'AI_PROVIDER phải là openai hoặc chatmock.');
  if (!env.STORE_AI_MODEL?.trim()) throw new HttpError(503, 'Thiếu STORE_AI_MODEL trên backend.');
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY?.trim()) throw new HttpError(503, 'Backend chưa có OPENAI_API_KEY. Nếu dùng ChatMock, đặt AI_PROVIDER=chatmock.');
    return { provider, apiKey: env.OPENAI_API_KEY.trim(), baseURL: 'https://api.openai.com/v1', headers: {} };
  }
  let url;
  try { url = new URL(env.CHATMOCK_BASE_URL?.trim() || 'http://127.0.0.1:8000/v1'); }
  catch { throw new HttpError(503, 'CHATMOCK_BASE_URL không hợp lệ.'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname) ||
      (local ? !['http:', 'https:'].includes(url.protocol) : url.protocol !== 'https:')) {
    throw new HttpError(503, 'ChatMock từ xa cần HTTPS và đường dẫn /v1; không chứa credential hoặc query.');
  }
  if (env.RENDER && local) throw new HttpError(503, 'ChatMock đang chạy trên máy bạn: Render cần URL HTTPS của tunnel, không dùng localhost.');
  const key = env.CHATMOCK_GATEWAY_SECRET?.trim();
  if ((!local || key) && (!key || key.length < 32 || /[\r\n]/.test(key))) throw new HttpError(503, 'ChatMock gateway cần CHATMOCK_GATEWAY_SECRET từ 32 ký tự.');
  return { provider, apiKey: 'chatmock-local', baseURL: url.href.replace(/\/$/, ''), headers: key ? { 'x-chatmock-key': key } : {} };
}

export async function boundedFetch(input, init) {
  // Do not follow redirects: they could leak the gateway secret to another host.
  const response = await fetch(input, { ...init, redirect: 'error' });
  if (!response.body) return response;
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new HttpError(502, 'Phản hồi AI vượt giới hạn. Chưa ghi giao dịch.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
}

export function createStoreAI(env = process.env) {
  const config = storeAIConfig(env);
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, defaultHeaders: config.headers,
    maxRetries: 0, timeout: 45000, fetch: boundedFetch });
  return { responses: { async create(payload) {
    try {
      const request = { ...payload, stream: false,
        ...(config.provider === 'chatmock' ? { reasoning: { effort: 'low', summary: null }, tools: [], tool_choice: 'none' } : {}),
      };
      if (config.provider === 'chatmock' && payload.text?.format?.type === 'json_schema') {
        // ChatGPT-backed gateways do not guarantee the official Structured Outputs API.
        // Ask for JSON explicitly, then keep the exact same server-side schema validation.
        request.instructions = `${payload.instructions ?? ''}\nChỉ trả một JSON object đúng schema sau, không Markdown, không giải thích ngoài JSON:\n${JSON.stringify(payload.text.format.schema)}`;
        delete request.text;
      }
      const result = await client.responses.create(request, { signal: AbortSignal.timeout(45000) });
      if ((result.output_text?.length ?? 0) > 30000) throw new HttpError(502, 'Phản hồi AI quá dài. Chưa ghi giao dịch.');
      return result;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (config.provider !== 'chatmock') throw error;
      if (error.status === 401) throw new HttpError(503, 'Phiên ChatMock hết hạn. Đăng nhập lại ChatMock trên máy đang chạy.');
      if (error.status === 403) throw new HttpError(503, 'Khóa ChatMock gateway không khớp. Kiểm tra CHATMOCK_GATEWAY_SECRET hai bên.');
      if (error.status === 429 || error.status === 409) throw new HttpError(429, 'ChatMock đang bận hoặc hết hạn mức. Hãy đợi rồi thử lại.');
      if (error.status === 400) throw new HttpError(502, 'ChatMock hoặc model từ chối định dạng yêu cầu. Kiểm tra model và hỗ trợ JSON schema.');
      throw new HttpError(503, 'Không kết nối được ChatMock. Kiểm tra máy, ChatMock, gateway và tunnel đang chạy.');
    }
  } } };
}
