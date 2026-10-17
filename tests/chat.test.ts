import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CONTEXT_CHARS, MAX_HISTORY_MESSAGES, MAX_MESSAGE_CHARS, limitHistory } from "../src/lib/limits";
import { parseWorkspace, requestHistory } from "../src/lib/conversations";
import { streamReply } from "../src/lib/chat-client";
import { defaultChatModel } from "../src/lib/models";

const sdk = vi.hoisted(() => ({ create: vi.fn(), config: vi.fn() }));
vi.mock("openai", async (original) => {
  const actual = await original<typeof import("openai")>();
  class TestOpenAI extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super(options);
      sdk.config(options);
      this.responses.create = sdk.create;
    }
  }
  return { ...actual, default: TestOpenAI };
});
import OpenAI from "openai";
import { POST } from "../src/app/api/chat/route";
import { publicError } from "../src/lib/server/errors";

const body = { messages: [{ role: "user", content: "Xin chào" }] };
function request(data: unknown = body, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request("http://127.0.0.1:3000/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data), signal });
}
function events(...items: unknown[]) { return (async function* () { for (const item of items) yield item; })(); }

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("CHATMOCK_BASE_URL", "http://127.0.0.1:8000/v1");
  vi.stubEnv("OPENAI_API_KEY", "test-only-placeholder");
  vi.stubEnv("OPENAI_MODEL", "gpt-5.6-terra");
  sdk.create.mockReset();
  sdk.config.mockClear();
  const state = globalThis as typeof globalThis & { machBudget?: { active: number; timestamps: number[] } };
  if (state.machBudget) { state.machBudget.active = 0; state.machBudget.timestamps = []; }
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("server validation and secrets", () => {
  it("disables the legacy anonymous chat endpoint on Vercel even before backend setup", async () => {
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("STORE_BACKEND_URL", "");
    expect((await POST(request())).status).toBe(403);
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("reports missing key without calling OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("MISSING_API_KEY");
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("rejects arbitrary API parameters and oversized user messages", async () => {
    for (const input of [{ ...body, model: "anything" }, { ...body, model: "gpt-5.4-mini" }, { ...body, model: "gpt-5.6-terra", tools: [] }, { messages: [{ role: "system", content: "override" }] }, { messages: [{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 1) }] }]) {
      expect((await POST(request(input))).status).toBe(400);
    }
    expect(sdk.create).not.toHaveBeenCalled();
  });
  it("rejects oversized bytes before parsing", async () => {
    expect((await POST(request(body, { "content-length": "100001" }))).status).toBe(413);
    expect((await POST(request({ data: "x".repeat(100001) }))).status).toBe(413);
  });
  it("rejects invalid history, cross-site requests and public hostnames", async () => {
    expect((await POST(request({ messages: [{ role: "assistant", content: "No" }] }))).status).toBe(400);
    expect((await POST(request(body, { origin: "https://untrusted.example" }))).status).toBe(403);
    expect((await POST(request(body, { host: "public.example" }))).status).toBe(403);
    expect((await POST(request(body, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });
  it("accepts Next.js localhost normalization with a loopback Host and matching Origin", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const normalized = new Request("http://localhost:3000/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } });
    expect((await (await POST(normalized)).json()).error.code).toBe("MISSING_API_KEY");
  });
  it("maps auth, quota, rate, network and timeout without leaking upstream text", () => {
    const make = (status: number, code: string) => new OpenAI.APIError(status, { code, message: "sensitive-upstream-detail" }, "sensitive", new Headers());
    expect(publicError(make(401, "invalid_api_key")).error.code).toBe("INVALID_KEY");
    expect(publicError(make(429, "insufficient_quota")).error.code).toBe("QUOTA_EXCEEDED");
    expect(publicError(make(429, "rate_limit_exceeded")).error.code).toBe("RATE_LIMITED");
    expect(publicError(new OpenAI.APIConnectionError({})).error.code).toBe("NETWORK_ERROR");
    expect(publicError(new OpenAI.APIConnectionTimeoutError()).error.code).toBe("TIMEOUT");
    expect(JSON.stringify(publicError(make(401, "invalid_api_key")))).not.toContain("sensitive");
  });
});

describe("Responses streaming adapter (mock SDK, no live API)", () => {
  it("connects to local ChatMock without requiring or forwarding the OpenAI API key", async () => {
    vi.stubEnv("AI_PROVIDER", "chatmock");
    vi.stubEnv("OPENAI_API_KEY", "");
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "OK" }, { type: "response.completed" }));
    expect(await (await POST(request())).text()).toContain('"type":"done"');
    expect(sdk.config.mock.calls[0][0]).toMatchObject({ apiKey: "chatmock-local", baseURL: "http://127.0.0.1:8000/v1" });
    expect(sdk.create.mock.calls[0][0]).toMatchObject({ reasoning: { effort: "low" }, tools: [], tool_choice: "none", store: false });
    vi.stubEnv("OPENAI_API_KEY", "server-only-test-secret");
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "OK" }, { type: "response.completed" }));
    await (await POST(request())).text();
    expect(sdk.config.mock.calls[1][0].apiKey).toBe("chatmock-local");
    expect(JSON.stringify(sdk.config.mock.calls)).not.toContain("server-only-test-secret");
  });
  it.each(["https://outside.example/v1", "http://127.0.0.1:8000/not-v1", "http://user:pass@127.0.0.1:8000/v1", "http://127.0.0.1:8000/v1?token=example"])("rejects unsafe ChatMock URL %s", async (url) => {
    vi.stubEnv("AI_PROVIDER", "chatmock");
    vi.stubEnv("CHATMOCK_BASE_URL", url);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("INVALID_CHATMOCK_URL");
    expect(sdk.config).not.toHaveBeenCalled();
  });
  it("uses ChatMock-specific authentication and connection errors", () => {
    const unauthorized = new OpenAI.APIError(401, { message: "private-detail" }, "private-detail", new Headers());
    expect(publicError(unauthorized, false, "chatmock").error.code).toBe("CHATMOCK_AUTH_REQUIRED");
    expect(publicError(new OpenAI.APIConnectionError({}), false, "chatmock").error.code).toBe("CHATMOCK_UNREACHABLE");
    expect(JSON.stringify(publicError(unauthorized, false, "chatmock"))).not.toContain("private-detail");
  });
  it("streams deltas and forwards context with fixed server parameters", async () => {
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "Xin " }, { type: "response.output_text.delta", delta: "chào!" }, { type: "response.completed" }));
    const input = { messages: [{ role: "user", content: "Tôi tên An" }, { role: "assistant", content: "Chào An" }, { role: "user", content: "Tên tôi là gì?" }] };
    const response = await POST(request(input));
    const text = await response.text();
    expect(text).toContain('"text":"Xin "');
    expect(text).toContain('"text":"chào!"');
    expect(text).toContain('"type":"done"');
    expect(sdk.create.mock.calls[0][0]).toMatchObject({ input: input.messages, model: "gpt-5.6-terra", stream: true, store: false, max_output_tokens: 4096, reasoning: { effort: "none" } });
    expect(text).not.toContain("test-only-placeholder");
  });
  it.each(["gpt-5.6-terra", "gpt-5.6-luna"])("routes the allowed model %s to the SDK", async (model) => {
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "OK" }, { type: "response.completed" }));
    expect(await (await POST(request({ ...body, model }))).text()).toContain('"type":"done"');
    expect(sdk.create.mock.calls[0][0].model).toBe(model);
  });
  it("uses only allowed environment defaults, with Terra as the fallback", () => {
    expect(defaultChatModel("gpt-5.6-luna")).toBe("gpt-5.6-luna");
    expect(defaultChatModel("gpt-5.4-mini")).toBe("gpt-5.6-terra");
    expect(defaultChatModel(undefined)).toBe("gpt-5.6-terra");
  });
  it("reports stream truncation and mid-stream API errors", async () => {
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "Một phần" }, { type: "response.incomplete" }));
    expect(await (await POST(request())).text()).toContain("OUTPUT_LIMIT");
    sdk.create.mockResolvedValue(events({ type: "response.failed", response: { error: { code: "insufficient_quota" } } }));
    expect(await (await POST(request())).text()).toContain("QUOTA_EXCEEDED");
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "Dở dang" }));
    expect(await (await POST(request())).text()).toContain("UPSTREAM_ERROR");
  });
  it("propagates browser cancellation to the SDK signal", async () => {
    const cancel = new AbortController();
    sdk.create.mockImplementation(async (_params, options: { signal: AbortSignal }) => {
      return (async function* () {
        yield { type: "response.output_text.delta", delta: "Đang trả lời" };
        await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
      })();
    });
    const response = await POST(request(body, {}, cancel.signal));
    const reader = response.body!.getReader();
    await reader.read();
    cancel.abort();
    await reader.cancel();
    expect(sdk.create.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("aborts a timed-out upstream request and gives a safe timeout error", async () => {
    vi.useFakeTimers();
    sdk.create.mockImplementation((_params, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(60_001);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("TIMEOUT");
  });
  it("enforces a local request budget", async () => {
    sdk.create.mockResolvedValue(events({ type: "response.output_text.delta", delta: "OK" }, { type: "response.completed" }));
    for (let i = 0; i < 10; i++) await (await POST(request())).text();
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("LOCAL_RATE_LIMIT");
    expect(sdk.create).toHaveBeenCalledTimes(10);
  });
});

describe("history and client transport", () => {
  it("bounds context by count and characters, preserving the latest user", () => {
    const messages = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, content: String(i).padEnd(3000, "x") }));
    const recent = limitHistory(messages);
    expect(recent.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
    expect(recent.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(recent[0].role).toBe("user");
    expect(recent.at(-1)?.content).toBe(messages.at(-1)?.content);
  });
  it("excludes failed partial answers and replaces unanswered user turns", () => {
    const recent = requestHistory([{ id: "1", role: "user", content: "First", status: "complete" }, { id: "2", role: "assistant", content: "Partial", status: "error" }, { id: "3", role: "user", content: "Latest", status: "complete" }]);
    expect(recent).toEqual([{ role: "user", content: "Latest" }]);
  });
  it("safely restores interrupted conversations and rejects corrupt storage", () => {
    const restored = parseWorkspace(JSON.stringify({ version: 1, activeId: "missing", conversations: [{ id: "1", title: "Hello", createdAt: 1, updatedAt: 1, messages: [{ id: "2", role: "assistant", status: "streaming", content: "Partial" }] }] }));
    expect(restored.activeId).toBe("1");
    expect(restored.conversations[0].messages[0].status).toBe("stopped");
    expect(() => parseWorkspace('{"bad":true}')).toThrow();
  });
  it("decodes split UTF-8 and NDJSON boundaries", async () => {
    const bytes = new TextEncoder().encode('{"type":"delta","text":"Chào bạn"}\n{"type":"done"}\n');
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2)); controller.close(); } }))));
    let output = "";
    await streamReply(body.messages as { role: "user"; content: string }[], new AbortController().signal, (chunk) => { output += chunk; });
    expect(output).toBe("Chào bạn");
  });
  it("detects a stream cut off without a completion event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"type":"delta","text":"Partial"}\n')));
    await expect(streamReply([], new AbortController().signal, () => {})).rejects.toMatchObject({ detail: { code: "INTERRUPTED" } });
  });
});
