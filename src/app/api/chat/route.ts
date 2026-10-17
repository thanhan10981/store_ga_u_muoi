import OpenAI from "openai";
import { MAX_ASSISTANT_CHARS, MAX_OUTPUT_TOKENS, REQUEST_TIMEOUT_MS, type StreamEvent } from "@/lib/limits";
import { AppError, publicError, streamFailure } from "@/lib/server/errors";
import { acquireRequest, guardLocal, readChatRequest } from "@/lib/server/guard";
import { defaultChatModel } from "@/lib/models";
import { connectionConfig } from "@/lib/server/connection";
import type { AIProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.VERCEL || process.env.STORE_BACKEND_URL || process.env.NODE_ENV === "production" && process.env.APP_ORIGIN) {
    return Response.json({ error: { code: "STORE_MODE", message: "Hãy đăng nhập và sử dụng chatbot cửa hàng." } }, { status: 403 });
  }
  let release: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let provider: AIProvider = "openai";
  const upstream = new AbortController();
  const abort = () => upstream.abort();
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    release?.();
  };
  try {
    guardLocal(request);
    const { messages, model } = await readChatRequest(request);
    const connection = connectionConfig();
    provider = connection.provider;
    release = acquireRequest();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) upstream.abort();
    timer = setTimeout(() => { timedOut = true; upstream.abort(); }, REQUEST_TIMEOUT_MS);
    const client = new OpenAI({ apiKey: connection.apiKey, baseURL: connection.baseURL, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
    const stream = await client.responses.create({
      model: model ?? defaultChatModel(process.env.OPENAI_MODEL),
      instructions: "Bạn là Gà, trợ lý AI hữu ích. Mặc định trả lời bằng tiếng Việt, rõ ràng và chính xác. Dùng Markdown khi phù hợp. Nói rõ khi không biết; không tự nhận đã tra cứu web hay thực hiện công việc bên ngoài. Không có công cụ truy cập web trong cuộc trò chuyện này.",
      input: messages,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: provider === "chatmock" ? "low" : "none" },
      ...(provider === "chatmock" ? { tools: [], tool_choice: "none" as const } : {}),
      stream: true,
      store: false,
    }, { signal: upstream.signal });
    const encoder = new TextEncoder();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StreamEvent) => { if (!cancelled && !request.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
        let chars = 0;
        let completed = false;
        try {
          for await (const event of stream) {
            if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
              chars += event.delta.length;
              if (chars > MAX_ASSISTANT_CHARS) throw new AppError("OUTPUT_LIMIT", "Phản hồi đã đạt giới hạn độ dài. Hãy đặt câu hỏi cụ thể hơn.", 422);
              send({ type: "delta", text: event.delta });
            } else if (event.type === "response.failed") {
              throw streamFailure(event.response.error?.code);
            } else if (event.type === "error") {
              throw streamFailure(event.code);
            } else if (event.type === "response.incomplete") {
              throw new AppError("OUTPUT_LIMIT", "Phản hồi chưa hoàn tất vì đạt giới hạn đầu ra. Hãy rút ngắn yêu cầu rồi thử lại.", 422);
            } else if (event.type === "response.completed") {
              completed = true;
            }
          }
          if (timedOut) throw new AppError("TIMEOUT", "Phản hồi quá 60 giây.", 504);
          if (!completed || chars === 0) throw streamFailure();
          send({ type: "done" });
        } catch (error) {
          if (!cancelled && !request.signal.aborted) send({ type: "error", error: publicError(error, timedOut, provider).error });
        } finally {
          upstream.abort();
          cleanup();
          if (!cancelled) controller.close();
        }
      },
      cancel() { cancelled = true; upstream.abort(); cleanup(); },
    });
    return new Response(body, { headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    } });
  } catch (error) {
    upstream.abort();
    cleanup();
    const result = publicError(error, timedOut, provider);
    return Response.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store", ...(result.status === 429 ? { "Retry-After": "60" } : {}) } });
  }
}
