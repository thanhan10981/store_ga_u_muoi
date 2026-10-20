import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { safeEqual } from './security.mjs';

export function createChatMockGateway({ secret = process.env.CHATMOCK_GATEWAY_SECRET, upstreamFetch = fetch } = {}) {
  if (!secret || secret.length < 32 || /[\r\n]/.test(secret)) throw new Error('CHATMOCK_GATEWAY_SECRET must have at least 32 characters.');
  let active = false; let attempts = [];
  const server = createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    if (!safeEqual(req.headers['x-chatmock-key'], secret)) return send(403, { error: 'Forbidden' });
    // Browsers must go through the authenticated store backend, never this gateway.
    if (req.headers.origin) return send(403, { error: 'Browser access denied' });
    const models = req.method === 'GET' && req.url === '/v1/models';
    const responses = req.method === 'POST' && req.url === '/v1/responses';
    if (!models && !responses) return send(404, { error: 'Not found' });
    const now = Date.now(); attempts = attempts.filter(t => now - t < 60000);
    if (attempts.length >= 60 || active) return send(429, { error: 'Busy' });
    attempts.push(now); active = true;
    try {
      let body;
      if (responses) {
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'JSON required' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) return send(413, { error: 'Body too large' }); chunks.push(chunk); }
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Invalid JSON' }); }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.stream === true) return send(400, { error: 'Non-streaming Responses requests only' });
        // Disable tools even if a caller with the gateway key sends different settings.
        body = JSON.stringify({ ...payload, stream: false, store: false, tools: [], tool_choice: 'none' });
      }
      const upstream = await upstreamFetch(`http://127.0.0.1:8000${req.url}`, {
        method: req.method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer chatmock-local' },
        body, signal: AbortSignal.timeout(45000), redirect: 'error',
      });
      if (!upstream.ok) return send(upstream.status === 401 ? 401 : upstream.status === 429 ? 429 : upstream.status === 400 ? 400 : 502, { error: 'ChatMock request failed' });
      if (!upstream.headers.get('content-type')?.includes('application/json')) return send(502, { error: 'Invalid ChatMock response' });
      const chunks = []; let size = 0;
      if (upstream.body) {
        const reader = upstream.body.getReader();
        try {
          while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
            if (size > 2 * 1024 * 1024) { await reader.cancel(); return send(502, { error: 'Response too large' }); } chunks.push(value); }
        } finally { reader.releaseLock(); }
      }
      const bytes = Buffer.concat(chunks);
      try { JSON.parse(bytes.toString('utf8')); } catch { return send(502, { error: 'Invalid JSON upstream' }); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
    } catch { if (!res.headersSent) send(503, { error: 'ChatMock unavailable' }); }
    finally { active = false; }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createChatMockGateway().listen(8001, '127.0.0.1', () => console.log('ChatMock gateway ready on 127.0.0.1:8001'));
}
