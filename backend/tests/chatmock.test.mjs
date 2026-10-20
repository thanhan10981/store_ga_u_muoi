import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatMockGateway } from '../chatmock-gateway.mjs';
import { storeAIConfig, createStoreAI } from '../ai-provider.mjs';

const key = 'test-only-chatmock-gateway-key-123456789';
test('ChatMock config never uses the real OpenAI API key and secures remote URLs', () => {
  const env = { AI_PROVIDER: 'chatmock', STORE_AI_MODEL: 'test-model', OPENAI_API_KEY: 'real-key-must-not-leak' };
  const local = storeAIConfig(env);
  assert.equal(local.apiKey, 'chatmock-local'); assert.deepEqual(local.headers, {});
  assert.throws(() => storeAIConfig({ ...env, RENDER: 'true' }), /tunnel/);
  for (const url of ['http://public.example/v1','https://key:secret@public.example/v1','https://public.example/v1?key=secret','https://public.example/other']) {
    assert.throws(() => storeAIConfig({ ...env, CHATMOCK_BASE_URL: url, CHATMOCK_GATEWAY_SECRET: key }));
  }
  assert.throws(() => storeAIConfig({ ...env, CHATMOCK_BASE_URL: 'https://gateway.example/v1' }), /32/);
  const remote = storeAIConfig({ ...env, CHATMOCK_BASE_URL: 'https://gateway.example/v1', CHATMOCK_GATEWAY_SECRET: key });
  assert.equal(remote.apiKey, 'chatmock-local'); assert.equal(remote.headers['x-chatmock-key'], key);
  const official = storeAIConfig({ ...env, AI_PROVIDER: 'openai', CHATMOCK_GATEWAY_SECRET: key });
  assert.equal(official.baseURL, 'https://api.openai.com/v1'); assert.deepEqual(official.headers, {});
});

test('gateway rejects unauthenticated browsers, arbitrary routes and streaming; never forwards secrets', async () => {
  const calls = [];
  const server = createChatMockGateway({ secret: key, upstreamFetch: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ status: 'completed', output: [] });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}, path = '/v1/responses') => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chatmock-key': key, ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({}, { 'x-chatmock-key': 'wrong' })).status, 403);
    assert.equal((await post({}, { origin: 'https://shop.example' })).status, 403);
    assert.equal((await post({}, {}, '/login')).status, 404);
    assert.equal((await post({ stream: true })).status, 400);
    assert.equal((await post({ input: 'x'.repeat(140000) })).status, 413);
    assert.equal(calls.length, 0);
    const response = await post({ input: 'test', tools: [{ type: 'web_search' }], tool_choice: 'auto' }, { cookie: 'must-not-forward', authorization: 'Bearer must-not-forward' });
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'http://127.0.0.1:8000/v1/responses');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer chatmock-local');
    assert.equal(calls[0].options.headers.cookie, undefined); assert.equal(calls[0].options.headers['x-chatmock-key'], undefined);
    assert.deepEqual(JSON.parse(calls[0].options.body).tools, []); assert.equal(JSON.parse(calls[0].options.body).tool_choice, 'none');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('real SDK transport sends only dummy auth to ChatMock and bounds errors and output', async () => {
  const original = globalThis.fetch; let mode = 'ok'; let captured;
  globalThis.fetch = async (input, options) => {
    captured = { input, options };
    if (mode === 'forbidden' || mode === 'unauthorized') return Response.json({ error: { message: 'internal secret must not be exposed' } }, { status: mode === 'forbidden' ? 403 : 401 });
    if (mode === 'large') return new Response('x'.repeat(2 * 1024 * 1024 + 1));
    return Response.json({ id: 'test', object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"test":true}', annotations: [] }] }] });
  };
  try {
    const client = createStoreAI({ AI_PROVIDER: 'chatmock', STORE_AI_MODEL: 'test', CHATMOCK_BASE_URL: 'https://gateway.example/v1', CHATMOCK_GATEWAY_SECRET: key, OPENAI_API_KEY: 'must-not-leak' });
    assert.equal((await client.responses.create({ model: 'test', input: 'test', text: { format: { type: 'json_schema', schema: { type: 'object' } } } })).output_text, '{"test":true}');
    const headers = new Headers(captured.options.headers);
    assert.equal(headers.get('authorization'), 'Bearer chatmock-local'); assert.equal(headers.get('x-chatmock-key'), key);
    assert.equal(captured.options.redirect, 'error'); assert.equal(JSON.parse(captured.options.body).tool_choice, 'none');
    assert.equal(JSON.parse(captured.options.body).text, undefined);
    assert.match(JSON.parse(captured.options.body).instructions, /"type":"object"/);
    mode = 'forbidden'; await assert.rejects(client.responses.create({ model: 'test', input: 'test' }), error => error.status === 503 && !error.message.includes('internal secret'));
    mode = 'large'; await assert.rejects(client.responses.create({ model: 'test', input: 'test' }));
    const official = createStoreAI({ AI_PROVIDER: 'openai', STORE_AI_MODEL: 'test', OPENAI_API_KEY: 'test-only' });
    mode = 'unauthorized';
    await assert.rejects(official.responses.create({ model: 'test', input: 'test' }), error => error.status === 503 && error.message.includes('AI_PROVIDER=chatmock') && !error.message.includes('internal secret'));
  } finally { globalThis.fetch = original; }
});
