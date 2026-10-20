export function validateSetup(env) {
  if (!env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong .env.render-admin.');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL sai định dạng. Chỉ dán chuỗi postgresql://..., không kèm lệnh psql.'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) throw new Error('DATABASE_URL cần đủ protocol PostgreSQL, host, tài khoản và mật khẩu.');
  if (url.hostname.includes('-pooler.')) throw new Error('DATABASE_URL đang dùng pooler. Tắt Connection pooling trên Neon rồi copy lại.');
  if (url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Đổi sslmode=require thành sslmode=verify-full trong DATABASE_URL.');
  if (!env.OWNER_USERNAME?.trim() || env.OWNER_USERNAME.trim().length > 80) throw new Error('OWNER_USERNAME phải có từ 1 đến 80 ký tự.');
  if (!env.OWNER_PASSWORD || env.OWNER_PASSWORD.length < 14 || env.OWNER_PASSWORD.length > 256) throw new Error('OWNER_PASSWORD phải dài từ 14 đến 256 ký tự.');
  if (!env.STORE_APP_PASSWORD || env.STORE_APP_PASSWORD.length < 32) throw new Error('STORE_APP_PASSWORD phải dài ít nhất 32 ký tự.');
}

export function setupFailure(stage, error) {
  // Never include error.message, query, detail, stack or credentials from external libraries.
  const nested = error?.cause ?? error?.errors?.[0];
  const candidate = error?.code ?? nested?.code;
  let code = typeof candidate === 'string' && /^[A-Z0-9_]{2,40}$/.test(candidate) ? candidate : 'UNKNOWN';
  if (code === 'UNKNOWN') {
    const message = String(error?.message ?? '');
    if (/timeout|timed out/i.test(message)) code = 'ETIMEDOUT';
    else if (/connection.*(?:terminated|closed|reset)/i.test(message)) code = 'ECONNRESET';
  }
  const hints = {
    '28P01': 'Mật khẩu Neon không đúng. Copy lại direct connection string có mật khẩu thật.',
    '42501': 'Một thao tác bị PostgreSQL từ chối. Kiểm tra quyền admin, ownership và phiên bản script; lỗi này không nhất thiết do dùng sai tài khoản.',
    'UNSAFE_RUNTIME_ROLE': 'store_app đang có quyền superuser. Công cụ đã dừng; cần quản trị viên sửa role trước khi dùng backend.',
    'ENOTFOUND': 'Không tìm thấy host. Kiểm tra host Neon và kết nối mạng.',
    'ECONNREFUSED': 'Không kết nối được database. Kiểm tra mạng, VPN/proxy và endpoint Neon.',
    'ECONNRESET': 'Kết nối bị ngắt. Kiểm tra mạng và trạng thái Neon rồi thử lại.',
    'ETIMEDOUT': 'Kết nối quá thời gian. Kiểm tra mạng và trạng thái compute Neon rồi thử lại.',
    'SELF_SIGNED_CERT_IN_CHAIN': 'Không xác minh được chứng chỉ TLS. Kiểm tra proxy/chứng chỉ máy, không tắt xác minh TLS.',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE': 'Không xác minh được chứng chỉ TLS. Kiểm tra proxy/chứng chỉ máy.',
    'EPERM': 'Môi trường chặn thao tác hoặc tiến trình con. Thử chạy từ terminal VS Code bình thường.',
  };
  return `Khởi tạo lỗi ở bước ${stage} (mã ${code}). ${hints[code] ?? 'Kiểm tra kết nối Neon, quyền admin và trạng thái database. Không gửi chuỗi kết nối hoặc mật khẩu vào chat.'}`;
}
