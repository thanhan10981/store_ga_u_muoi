import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "../src/app/api/store/[...path]/route";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("store backend proxy", () => {
  function config() { vi.stubEnv("STORE_BACKEND_URL", "http://backend:4000"); vi.stubEnv("BACKEND_PROXY_SECRET", "server-only-test-key"); vi.stubEnv("APP_ORIGIN", "https://shop.example.com"); }
  function request(body = "{}", origin = "https://shop.example.com", path = "login") { return new NextRequest(`https://shop.example.com/api/store/${path}`, { method: "POST", headers: { origin, "Content-Type": "application/json", "x-backend-key": "attacker-controlled", cookie: "session=test", "x-csrf-token": "csrf-test" }, body }); }
  it("fails closed when unconfigured", async () => { vi.stubEnv("STORE_BACKEND_URL", ""); expect((await GET(new NextRequest("http://localhost/api/store/session"))).status).toBe(503); });
  it("rejects foreign origins, unknown paths and bodies exceeding the streaming limit", async () => {
    config(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request("{}", "https://evil.example"))).status).toBe(403);
    expect((await POST(request("{}", undefined, "anything"))).status).toBe(404);
    expect((await POST(request('"' + "x".repeat(17000) + '"'))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires HTTPS backend origins on Vercel", async () => {
    config(); vi.stubEnv("VERCEL", "1");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("STORE_BACKEND_URL", "https://api.example.com/redirect?secret=test");
    expect((await POST(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows attachment-sized chat bodies while retaining a strict limit on other actions", async () => {
    config();
    const fetch = vi.fn().mockResolvedValue(Response.json({ answer: "test" })); vi.stubGlobal("fetch", fetch);
    const payload = JSON.stringify({ message: "Đọc tệp", attachments: [{ name: "invoice.txt", data: "YQ==".repeat(10000) }] });
    expect((await POST(request(payload, undefined, "chat"))).status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await POST(request(payload, undefined, "confirm"))).status).toBe(413);
    expect((await POST(request('"' + 'x'.repeat(4 * 1024 * 1024) + '"', undefined, "chat"))).status).toBe(413);
  });
  it("forwards only approved headers and sets the internal key server-side", async () => {
    config(); const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { headers: { "set-cookie": "session=abc; HttpOnly", "X-Backend-Key": "must-never-return" } })); vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toContain("HttpOnly"); expect(response.headers.has("x-backend-key")).toBe(false);
    const [url, options] = fetch.mock.calls[0]; expect(String(url)).toBe("http://backend:4000/api/store/login");
    expect(options.headers.get("x-backend-key")).toBe("server-only-test-key");
    expect(options.headers.get("cookie")).toBe("session=test"); expect(options.headers.get("x-csrf-token")).toBe("csrf-test");
  });
});
