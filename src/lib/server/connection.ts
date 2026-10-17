import "server-only";
import type { AIProvider } from "../providers";
import { AppError } from "./errors";

export function connectionConfig(): { provider: AIProvider; apiKey: string; baseURL: string } {
  const provider = process.env.AI_PROVIDER?.trim() || "openai";
  if (provider !== "openai" && provider !== "chatmock") {
    throw new AppError("INVALID_PROVIDER", "AI_PROVIDER phải là openai hoặc chatmock trong cấu hình server.", 503);
  }
  if (provider === "chatmock") {
    let url: URL;
    try { url = new URL(process.env.CHATMOCK_BASE_URL?.trim() || "http://127.0.0.1:8000/v1"); }
    catch { throw new AppError("INVALID_CHATMOCK_URL", "CHATMOCK_BASE_URL không hợp lệ. Ví dụ: http://127.0.0.1:8000/v1", 503); }
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) {
      throw new AppError("INVALID_CHATMOCK_URL", "ChatMock chỉ được cấu hình tới địa chỉ HTTP loopback với đường dẫn /v1, không kèm thông tin đăng nhập hay query.", 503);
    }
    // ChatMock authenticates through its own ChatGPT session. Never forward the
    // user's real OpenAI API key or read/copy ChatMock's OAuth credentials here.
    return { provider, apiKey: "chatmock-local", baseURL: url.href.replace(/\/$/, "") };
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    throw new AppError("MISSING_API_KEY", "Chưa cấu hình API key. Hãy thêm OPENAI_API_KEY vào .env.local trên máy và khởi động lại ứng dụng.", 503);
  }
  return { provider, apiKey, baseURL: "https://api.openai.com/v1" };
}
