import { ChatApp } from "@/components/chat-app";
import { defaultChatModel } from "@/lib/models";
import { StoreApp } from "@/components/store-app";

export const dynamic = "force-dynamic";

export default function Home() {
  if (process.env.STORE_BACKEND_URL) return <StoreApp />;
  const key = process.env.OPENAI_API_KEY?.trim();
  const provider = process.env.AI_PROVIDER?.trim() === "chatmock" ? "chatmock" : "openai";
  return <ChatApp provider={provider} configured={provider === "chatmock" || Boolean(key && key !== "your_openai_api_key_here")} model={defaultChatModel(process.env.OPENAI_MODEL)} />;
}
