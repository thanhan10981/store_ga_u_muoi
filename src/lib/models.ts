export const CHAT_MODELS = [
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
] as const;

export const CHAT_MODEL_IDS = ["gpt-5.6-terra", "gpt-5.6-luna"] as const;
export type ChatModel = (typeof CHAT_MODEL_IDS)[number];
export const DEFAULT_CHAT_MODEL: ChatModel = "gpt-5.6-terra";

export function isChatModel(value: unknown): value is ChatModel {
  return typeof value === "string" && CHAT_MODEL_IDS.some((id) => id === value);
}

export function defaultChatModel(value?: string): ChatModel {
  const trimmed = value?.trim();
  return isChatModel(trimmed) ? trimmed : DEFAULT_CHAT_MODEL;
}
