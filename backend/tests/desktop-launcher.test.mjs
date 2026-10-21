import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController, extractTunnelURL, parseTunnelConfig } from '../../deploy/desktop-launcher.mjs';

test('fixed tunnel config requires HTTPS origin and a separate connector token', () => {
  assert.equal(parseTunnelConfig(null), null);
  const token = 'a'.repeat(100);
  assert.deepEqual(parseTunnelConfig(`CHATMOCK_PUBLIC_URL=https://chatmock.example.com\nCLOUDFLARE_TUNNEL_TOKEN=${token}`), { url: 'https://chatmock.example.com', token });
  for (const url of ['http://chatmock.example.com', 'https://user:pass@chatmock.example.com', 'https://chatmock.example.com/v1', 'https://chatmock.example.com?token=x'])
    assert.throws(() => parseTunnelConfig(`CHATMOCK_PUBLIC_URL=${url}\nCLOUDFLARE_TUNNEL_TOKEN=${token}`));
  assert.throws(() => parseTunnelConfig('CHATMOCK_PUBLIC_URL=https://chatmock.example.com\nCLOUDFLARE_TUNNEL_TOKEN=short'));
});

test('desktop launcher extracts only the expected temporary Cloudflare hostname', () => {
  assert.equal(extractTunnelURL('INF | https://small-test.trycloudflare.com |'), 'https://small-test.trycloudflare.com');
  assert.equal(extractTunnelURL('https://test.trycloudflare.com.evil.example'), null);
  assert.equal(extractTunnelURL('http://small-test.trycloudflare.com'), null);
  assert.equal(extractTunnelURL('CHATMOCK_GATEWAY_SECRET=not-a-url'), null);
});
test('desktop stop control requires its own local token and refuses browser access', async () => {
  let stopped = 0;
  const token = 'test-only-local-controller-token';
  const server = createController({ token, onStop: () => { stopped++; }, getStatus: () => ({ running: true, tunnelURL: null }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url + '/stop', { method: 'POST' })).status, 403);
    assert.equal((await fetch(url + '/stop', { method: 'POST', headers: { 'x-launcher-token': token, origin: 'https://outside.example' } })).status, 403);
    const status = await fetch(url + '/status', { headers: { 'x-launcher-token': token } });
    assert.deepEqual(await status.json(), { running: true, tunnelURL: null });
    assert.equal(stopped, 0);
    assert.equal((await fetch(url + '/stop', { method: 'POST', headers: { 'x-launcher-token': token } })).status, 202);
    await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(stopped, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
