import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function proxy(request: NextRequest) {
  const base = process.env.STORE_BACKEND_URL;
  const secret = process.env.BACKEND_PROXY_SECRET;
  if (!base || !secret) return Response.json({ error: "Chưa cấu hình backend cửa hàng." }, { status: 503 });
  if (process.env.VERCEL) {
    try {
      const url = new URL(base);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid backend URL");
    } catch { return Response.json({ error: "STORE_BACKEND_URL trên Vercel phải là HTTPS origin của backend Render." }, { status: 503 }); }
  }
  const expected = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
  if (request.method === "POST" && (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site")) {
    return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  const path = request.nextUrl.pathname;
  const allowed = new Set(["login", "logout", "session", "chat", "confirm", "cancel", "reports"]);
  if (!allowed.has(path.slice("/api/store/".length))) return Response.json({ error: "Không tìm thấy API." }, { status: 404 });
  try {
    const headers = new Headers({ "x-backend-key": secret });
    for (const name of ["cookie", "origin", "content-type", "x-csrf-token"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let body: Uint8Array | undefined;
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length")) > 16384) return Response.json({ error: "Yêu cầu quá lớn." }, { status: 413 });
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 16384) { await reader.cancel(); return Response.json({ error: "Yêu cầu quá lớn." }, { status: 413 }); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    }
    const response = await fetch(new URL(path, base), { method: request.method, headers, body: body as BodyInit | undefined, cache: "no-store", signal: AbortSignal.timeout(110000), redirect: "error" });
    const resultHeaders = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    for (const name of ["set-cookie", "retry-after", "x-request-id"]) {
      const value = response.headers.get(name);
      if (value) resultHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: resultHeaders });
  } catch {
    return Response.json({ error: "Mất kết nối backend. Tải lại trang để kiểm tra trạng thái phiếu trước khi thử lại." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
export const GET = proxy;
export const POST = proxy;
