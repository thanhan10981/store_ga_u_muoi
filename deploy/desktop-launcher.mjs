import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = join(root, '.chatmock-run');
const stateFile = join(runtime, 'launcher.json');
const lockFile = join(runtime, 'launcher.lock');
const tunnelTokenFile = join(runtime, 'tunnel-token');

export function parseTunnelConfig(source) {
  if (source === null) return null;
  const env = parseEnv(source);
  let url;
  try { url = new URL(env.CHATMOCK_PUBLIC_URL); } catch { throw new Error('CHATMOCK_PUBLIC_URL trong .env.chatmock-tunnel phải là URL HTTPS.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !url.hostname.includes('.'))
    throw new Error('CHATMOCK_PUBLIC_URL chỉ gồm https:// và hostname, không thêm /v1.');
  if (!/^[A-Za-z0-9_+/=-]{64,}$/.test(env.CLOUDFLARE_TUNNEL_TOKEN ?? ''))
    throw new Error('Điền token tunnel Cloudflare hợp lệ trong file local .env.chatmock-tunnel.');
  return { url: url.origin, token: env.CLOUDFLARE_TUNNEL_TOKEN };
}

export function extractTunnelURL(text) {
  return String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com(?=[\s/|]|$)/i)?.[0] ?? null;
}

export function createController({ token, onStop, getStatus }) {
  return createServer((request, response) => {
    const provided = request.headers['x-launcher-token'];
    const authorized = typeof provided === 'string' && Buffer.byteLength(provided) === Buffer.byteLength(token) &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(token));
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
    if (!authorized || request.headers.origin) return send(403, { error: 'Forbidden' });
    if (request.method === 'GET' && request.url === '/status') return send(200, getStatus());
    if (request.method === 'POST' && request.url === '/stop') { send(202, { stopping: true }); setTimeout(onStop, 50); return; }
    send(404, { error: 'Not found' });
  });
}

async function callController(path, method = 'GET') {
  if (!existsSync(stateFile)) return null;
  let state;
  try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; }
  if (!Number.isInteger(state.port) || state.port < 1 || state.port > 65535 || !/^[a-f0-9]{64}$/.test(state.token ?? '')) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}${path}`, { method,
      headers: { 'x-launcher-token': state.token }, signal: AbortSignal.timeout(2000), redirect: 'error' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function probe(url, status) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'error' }); await response.body?.cancel(); return response.status === status; }
  catch { return false; }
}

async function waitReady(child, url, status) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Tiến trình đã dừng khi khởi động. Xem log trong thư mục .chatmock-run.');
    if (await probe(url, status)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Chưa thấy dịch vụ sẵn sàng. Xem log trong thư mục .chatmock-run.');
}

function findPython() {
  const result = spawnSync('where.exe', ['python'], { windowsHide: true, encoding: 'utf8' });
  const path = result.stdout?.split(/\r?\n/).map(v => v.trim()).find(v => v && existsSync(v));
  if (!path) throw new Error('Chưa tìm thấy Python. Cài Python 3.11 trở lên rồi chạy lại.');
  return path;
}

function findCloudflared() {
  const result = spawnSync('where.exe', ['cloudflared'], { windowsHide: true, encoding: 'utf8' });
  const candidates = [result.stdout?.split(/\r?\n/)[0]?.trim(),
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', 'cloudflared.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe')];
  const path = candidates.find(v => v && existsSync(v));
  if (!path) throw new Error('Chưa tìm thấy cloudflared trên máy.');
  return path;
}

function preflight() {
  if (process.platform !== 'win32') throw new Error('Bộ khởi chạy này dành cho Windows.');
  const envFile = join(root, '.env.chatmock-gateway');
  if (!existsSync(envFile)) throw new Error('Thiếu file local .env.chatmock-gateway bên cạnh package.json.');
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  if (!env.CHATMOCK_GATEWAY_SECRET || env.CHATMOCK_GATEWAY_SECRET.trim().length < 32) throw new Error('Khóa gateway trong .env.chatmock-gateway cần ít nhất 32 ký tự.');
  if (!existsSync(join(root, 'node_modules', 'zod'))) throw new Error('Chưa cài thư viện Node. Chạy npm ci một lần trong thư mục dự án.');
  const python = findPython();
  const checked = spawnSync(python, ['-c', 'import flask, flask_sock, requests, websockets'], { windowsHide: true });
  if (checked.status !== 0) throw new Error('Thiếu thư viện Python. Chạy python -m pip install ./ChatMock-main một lần.');
  const tunnelEnvFile = join(root, '.env.chatmock-tunnel');
  const tunnel = parseTunnelConfig(existsSync(tunnelEnvFile) ? readFileSync(tunnelEnvFile, 'utf8') : null);
  return { python, cloudflared: findCloudflared(), tunnel };
}

export async function main(args = process.argv.slice(2)) {
  process.chdir(root);
  if (args.includes('--stop')) {
    const stopped = await callController('/stop', 'POST');
    console.log(stopped ? 'Đã gửi lệnh tắt ChatMock, gateway và tunnel do bộ khởi chạy mở.' : 'Không có bộ khởi chạy đang hoạt động. Các terminal mở thủ công cần tắt riêng bằng Ctrl+C.');
    return;
  }
  const tools = preflight();
  if (args.includes('--check')) { console.log('Kiểm tra đạt: Python, Node dependencies, cloudflared và file gateway đã có. Chưa mở dịch vụ hoặc tunnel.'); return; }
  const existing = await callController('/status');
  if (existing) {
    console.log('Chatbot đã được khởi chạy. Không mở thêm tiến trình.');
    if (existing.tunnelURL) console.log(`CHATMOCK_BASE_URL=${existing.tunnelURL}/v1`);
    console.log('Để tắt: nhấp đúp Tat-Chatbot.cmd.');
    return;
  }
  mkdirSync(runtime, { recursive: true });
  if (existsSync(lockFile)) {
    let managerId;
    try { managerId = JSON.parse(readFileSync(lockFile, 'utf8')).pid; } catch { /* stale state */ }
    let alive = false;
    if (Number.isInteger(managerId) && managerId > 0) { try { process.kill(managerId, 0); alive = true; } catch { /* dead launcher */ } }
    if (alive) throw new Error('Bộ khởi chạy khác đang mở hoặc đang khởi động. Đợi một lát, hoặc đóng cửa sổ cũ rồi thử lại.');
    unlinkSync(lockFile);
  }
  try { writeFileSync(lockFile, JSON.stringify({ pid: process.pid }), { flag: 'wx' }); }
  catch { throw new Error('Bộ khởi chạy khác vừa được mở. Chỉ cần nhấp đúp một lần.'); }

  const children = []; const logs = []; let tunnelURL = null; let controller; let stopping = false; let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { try { child.kill(); } catch { /* already stopped */ } }
    for (const log of logs) log.end();
    for (const path of [stateFile, lockFile, tunnelTokenFile]) { try { unlinkSync(path); } catch { /* no stale state */ } }
  };
  const stop = (exitCode = 0) => {
    if (stopping) return; stopping = true;
    console.log('\nĐang tắt các tiến trình do bộ khởi chạy mở…');
    cleanup(); controller?.close();
    setTimeout(() => process.exit(Number.isInteger(exitCode) ? exitCode : 0), 300);
  };
  const launch = (name, executable, arguments_, onOutput) => {
    const log = createWriteStream(join(runtime, `${name}.log`), { flags: 'w' }); logs.push(log);
    const child = spawn(executable, arguments_, { cwd: root, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.once('error', () => { console.error(`Không mở được ${name}.`); stop(1); });
    child.once('exit', () => { if (!stopping) { console.error(`${name} đã dừng. Xem .chatmock-run\\${name}.log rồi mở lại bộ khởi chạy.`); stop(1); } });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', chunk => { log.write(chunk); onOutput?.(chunk.toString('utf8')); });
    }
    return child;
  };
  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, stop);
  try {
    // The control token is local-only and independent of the ChatMock/Render keys.
    const token = randomBytes(32).toString('hex');
    controller = createController({ token, onStop: stop, getStatus: () => ({ running: true, tunnelURL }) });
    await new Promise((resolve, reject) => { controller.once('error', reject); controller.listen(0, '127.0.0.1', resolve); });
    writeFileSync(stateFile, JSON.stringify({ port: controller.address().port, token }), { mode: 0o600 });
    console.log('GÀ · Khởi chạy ChatMock trên máy\n');
    const reuseChatMock = await probe('http://127.0.0.1:8000/health', 200);
    if (reuseChatMock) console.log('ChatMock: đang chạy sẵn, dùng lại (không tắt tiến trình mở thủ công).');
    else {
      const child = launch('chatmock', tools.python, ['ChatMock-main/chatmock.py', 'serve', '--host', '127.0.0.1', '--port', '8000', '--reasoning-effort', 'low', '--reasoning-summary', 'none', '--no-enable-web-search', '--no-fast-mode']);
      await waitReady(child, 'http://127.0.0.1:8000/health', 200);
      console.log('ChatMock: sẵn sàng.');
    }
    const reuseGateway = await probe('http://127.0.0.1:8001/v1/models', 403);
    if (reuseGateway) console.log('Gateway: đang chạy sẵn, dùng lại (không tắt tiến trình mở thủ công).');
    else {
      const child = launch('gateway', process.execPath, ['--env-file=.env.chatmock-gateway', 'backend/chatmock-gateway.mjs']);
      await waitReady(child, 'http://127.0.0.1:8001/v1/models', 403);
      console.log('Gateway: sẵn sàng.');
    }
    let buffer = '';
    let tunnelArgs = ['tunnel', '--url', 'http://127.0.0.1:8001'];
    if (tools.tunnel) {
      writeFileSync(tunnelTokenFile, tools.tunnel.token, { mode: 0o600 });
      tunnelArgs = ['tunnel', 'run', '--token-file', tunnelTokenFile];
    }
    launch('tunnel', tools.cloudflared, tunnelArgs, chunk => {
      buffer = (buffer + chunk).slice(-16000);
      const found = tools.tunnel ? (/Registered tunnel connection/.test(buffer) ? tools.tunnel.url : null) : extractTunnelURL(buffer);
      if (found && found !== tunnelURL) {
        tunnelURL = found;
        const value = `CHATMOCK_BASE_URL=${tunnelURL}/v1`;
        writeFileSync(join(runtime, 'render-env.txt'), `${value}\r\n`, 'utf8');
        console.log(`\n${tools.tunnel ? 'URL tunnel cố định' : 'URL tunnel tạm mới'}:\n${value}\n`);
        console.log('Trên Render: cập nhật CHATMOCK_BASE_URL theo dòng trên, lưu và redeploy backend.');
        if (tools.tunnel) console.log('Chỉ cần cập nhật Render một lần; URL này giữ nguyên khi bật lại.');
        console.log('Không đổi CHATMOCK_GATEWAY_SECRET hoặc các biến database.');
        console.log(`Dòng URL cũng được lưu ở: ${join(runtime, 'render-env.txt')}`);
      }
    });
    console.log('\nĐang tạo tunnel… Giữ cửa sổ này mở.');
    console.log('Nhấn Ctrl+C hoặc nhấp đúp Tat-Chatbot.cmd để tắt.');
    console.log('Nếu hết phiên ChatMock: tắt, nhấp đúp Dang-nhap-ChatMock.cmd, đăng nhập rồi bật lại.');
  } catch (error) {
    stopping = true; cleanup(); controller?.close(); throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
}
