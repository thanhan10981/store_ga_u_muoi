import "server-only";
import OpenAI from "openai";
import type { ChatError } from "../limits";
import type { AIProvider } from "../providers";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function publicError(error: unknown, timedOut = false, provider: AIProvider = "openai"): { error: ChatError; status: number } {
  if (timedOut || error instanceof OpenAI.APIConnectionTimeoutError) {
    return { status: 504, error: { code: "TIMEOUT", message: "Phản hồi quá 60 giây. Bạn có thể thử lại hoặc rút ngắn câu hỏi." } };
  }
  if (error instanceof AppError) {
    return { status: error.status, error: { code: error.code, message: error.message } };
  }
  // Never return an upstream message, request object, key, or stack trace.
  if (error instanceof OpenAI.APIError) {
    if (provider === "chatmock" && error.status === 401) return { status: 401, error: { code: "CHATMOCK_AUTH_REQUIRED", message: "ChatMock chưa đăng nhập hoặc phiên ChatGPT đã hết hạn. Chạy python ChatMock-main/chatmock.py login trên máy rồi thử lại." } };
    if (error.status === 401) return { status: 401, error: { code: "INVALID_KEY", message: "API key không hợp lệ hoặc đã bị thu hồi. Hãy kiểm tra OPENAI_API_KEY trên server." } };
    if (error.code === "insufficient_quota" || error.code === "billing_hard_limit_reached") {
      return { status: 429, error: { code: "QUOTA_EXCEEDED", message: "Tài khoản OpenAI đã hết hạn mức hoặc chưa có số dư. Hãy kiểm tra thanh toán và ngân sách API." } };
    }
    if (error.status === 429) return { status: 429, error: { code: "RATE_LIMITED", message: "OpenAI đang giới hạn tốc độ. Vui lòng đợi một chút rồi thử lại." } };
    if (error.status === 403 || error.status === 404 || error.status === 400) return { status: 502, error: { code: "MODEL_UNAVAILABLE", message: "Không thể sử dụng model đã cấu hình. Hãy kiểm tra OPENAI_MODEL và quyền truy cập của API key." } };
  }
  if (provider === "chatmock" && error instanceof OpenAI.APIConnectionError) return { status: 502, error: { code: "CHATMOCK_UNREACHABLE", message: "Không kết nối được ChatMock local. Hãy chạy ChatMock trên cổng 8000 và kiểm tra CHATMOCK_BASE_URL." } };
  if (error instanceof OpenAI.APIConnectionError) return { status: 502, error: { code: "NETWORK_ERROR", message: "Server không kết nối được OpenAI. Hãy kiểm tra kết nối mạng rồi thử lại." } };
  return { status: 502, error: { code: "UPSTREAM_ERROR", message: "Dịch vụ AI tạm thời gián đoạn. Vui lòng thử lại sau." } };
}

export function streamFailure(code?: string | null): AppError {
  if (code === "insufficient_quota" || code === "billing_hard_limit_reached") return new AppError("QUOTA_EXCEEDED", "Tài khoản OpenAI đã hết hạn mức. Hãy kiểm tra số dư và ngân sách API.", 429);
  if (code === "rate_limit_exceeded") return new AppError("RATE_LIMITED", "OpenAI đang giới hạn tốc độ. Vui lòng đợi rồi thử lại.", 429);
  return new AppError("UPSTREAM_ERROR", "Luồng phản hồi bị gián đoạn. Bạn có thể thử lại.", 502);
}
