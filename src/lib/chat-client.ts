import type { ChatError, StreamEvent, WireMessage } from "./limits";
import type { ChatModel } from "./models";

export class ChatRequestError extends Error {
  constructor(public detail: ChatError) { super(detail.message); }
}

export async function streamReply(messages: WireMessage[], signal: AbortSignal, onDelta: (text: string) => void, model?: ChatModel) {
  let response: Response;
  try {
    response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, model }), signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ChatRequestError({ code: "NETWORK_ERROR", message: "Không kết nối được ứng dụng. Kiểm tra mạng và server local rồi thử lại." });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ChatRequestError(data?.error?.message ? data.error : { code: "SERVER_ERROR", message: "Ứng dụng gặp lỗi. Vui lòng thử lại." });
  }
  if (!response.body) throw new ChatRequestError({ code: "EMPTY_STREAM", message: "Trình duyệt không nhận được luồng phản hồi." });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "delta") onDelta(event.text);
    else if (event.type === "done") completed = true;
    else if (event.type === "error") throw new ChatRequestError(event.error);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    consume(pending);
    if (!completed) throw new ChatRequestError({ code: "INTERRUPTED", message: "Kết nối bị ngắt trước khi phản hồi hoàn tất. Bạn có thể thử lại." });
  } catch (error) {
    if (signal.aborted || error instanceof ChatRequestError) throw error;
    throw new ChatRequestError({ code: "NETWORK_ERROR", message: "Luồng phản hồi bị gián đoạn. Kiểm tra mạng rồi thử lại." });
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
