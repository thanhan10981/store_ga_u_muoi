import { z } from "zod";
import { MAX_ASSISTANT_CHARS, MAX_MESSAGE_CHARS, limitHistory } from "./limits";

export const STORAGE_KEY = "mach-conversations-v1";
export const MAX_CONVERSATIONS = 50;
export const MAX_STORED_MESSAGES = 200;

const messageSchema = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_ASSISTANT_CHARS),
  status: z.enum(["complete", "streaming", "stopped", "error"]),
  error: z.object({ code: z.string().max(80), message: z.string().max(1000) }).optional(),
});
const conversationSchema = z.object({
  id: z.string().max(100), title: z.string().min(1).max(80),
  createdAt: z.number(), updatedAt: z.number(),
  messages: z.array(messageSchema).max(MAX_STORED_MESSAGES),
});
const workspaceSchema = z.object({ version: z.literal(1), activeId: z.string().nullable(), conversations: z.array(conversationSchema).max(MAX_CONVERSATIONS) });

export type Message = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;

export function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "Cuộc trò chuyện mới", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
}

export function parseWorkspace(raw: string): Workspace {
  const parsed = workspaceSchema.parse(JSON.parse(raw));
  parsed.conversations.forEach((c) => c.messages.forEach((m) => {
    if (m.status === "streaming") m.status = "stopped";
  }));
  if (!parsed.conversations.some((c) => c.id === parsed.activeId)) parsed.activeId = parsed.conversations[0]?.id ?? null;
  return parsed;
}

export function requestHistory(messages: Message[]) {
  return limitHistory(messages.filter((m) => m.role === "user" || m.status === "complete").map(({ role, content }) => ({ role, content: role === "user" ? content.slice(0, MAX_MESSAGE_CHARS) : content })));
}
