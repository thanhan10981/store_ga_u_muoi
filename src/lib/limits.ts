export const MAX_MESSAGE_CHARS = 6_000;
export const MAX_ASSISTANT_CHARS = 16_000;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_CONTEXT_CHARS = 24_000;
export const MAX_BODY_BYTES = 100_000;
export const MAX_OUTPUT_TOKENS = 4_096;
export const REQUEST_TIMEOUT_MS = 60_000;
export const MAX_REQUESTS_PER_MINUTE = 10;
export const MAX_CONCURRENT_REQUESTS = 2;

export type WireMessage = { role: "user" | "assistant"; content: string };
export type ChatError = { code: string; message: string };
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: ChatError };

// Keep recent, whole user/assistant turns, always ending with the latest user.
export function limitHistory(messages: WireMessage[]): WireMessage[] {
  const alternating: WireMessage[] = [];
  for (const message of messages) {
    if (!message.content.trim()) continue;
    const previous = alternating.at(-1);
    if (previous?.role === message.role) alternating[alternating.length - 1] = message;
    else if (message.role === "user" || previous) alternating.push(message);
  }
  let recent = alternating.slice(-MAX_HISTORY_MESSAGES);
  while (recent.length > 1 && (recent[0].role !== "user" || recent.reduce((n, m) => n + m.content.length, 0) > MAX_CONTEXT_CHARS)) {
    recent = recent.slice(1);
  }
  return recent;
}
