# Backend Render Free + PostgreSQL Neon

Đây là cấu hình backend hiện tại. `render.yaml` chỉ tạo **một Web Service Free**, không tạo database Render. Phần frontend chưa đổi nền tảng trong bước này.

## 1. Tạo database Neon trước

Tạo project Free tại Neon, chọn region gần Singapore nếu tài khoản có lựa chọn phù hợp. Trong hộp Connect, chọn database (thường `neondb`), **tắt Connection pooling** và lấy direct connection string. Backend dùng session advisory lock nên không dùng hostname có `-pooler`.

Giữ credential mặc định `neondb_owner` cho bước quản trị local. Không tạo runtime role bằng nút Add role trên Neon vì role tạo qua Console/API/CLI được cấp membership `neon_superuser`. Công cụ dưới tạo `store_app` bằng SQL với quyền hạn chế.

## 2. Tạo schema, tài khoản database runtime và tài khoản chủ

1. Đã cài Node 24, chạy `npm ci` nếu chưa có dependency.
2. Sao chép `.env.render-admin.example` thành `.env.render-admin` (file thật được gitignore).
3. Điền admin `DATABASE_URL` Neon direct, đổi `sslmode=require` trong URL thành **`sslmode=verify-full`** nếu có, hoặc thêm tham số khi chưa có. Giữ các phần host/database đúng theo Neon.
4. Đặt `STORE_APP_PASSWORD` ngẫu nhiên từ 32 ký tự, `OWNER_USERNAME`, `OWNER_PASSWORD` từ 14 ký tự. Không đưa các giá trị này vào chat.
5. Chạy:

```powershell
npm run render:setup
```

Script tạo bảng, `store_app` và tài khoản chủ. Chạy lại cùng username sẽ đổi mật khẩu và thu hồi phiên chủ cũ; không chạy mỗi lần deploy thông thường.

Tạo mã bí mật Authenticator bằng `node backend/admin.mjs totp`, lưu secret vào ứng dụng Authenticator và biến `OWNER_TOTP_SECRET` của Render. Không chụp/chia sẻ đầu ra chứa secret.

Sau bootstrap, bảo vệ hoặc xóa file admin local. Runtime không được dùng URL `neondb_owner`.

## 3. Tạo backend trên Render

Đẩy mã mới nhất lên GitHub. Chọn New → Blueprint → repo `store_ga_u_muoi` → branch `main` → `render.yaml`. Chỉ có service `ga-u-muoi-api`, plan **Free**, không có resource Postgres.

Cũng có thể tạo thủ công bằng New → Web Service:

| Thiết lập | Giá trị |
|---|---|
| Runtime / Language | Docker |
| Branch | main |
| Root Directory | Để trống (repo root) |
| Dockerfile Path | `./Dockerfile` |
| Docker Context | `.` |
| Docker Command | Để trống, dùng CMD mặc định |
| Instance Type | Free |
| Region | Singapore |
| Health Check Path | `/healthz` |

Dockerfile hiện có stage cuối là backend, không cần đổi start/build command sang Next.js. Render cung cấp `PORT`, server bind `0.0.0.0`.

## 4. Biến môi trường Render

Tham khảo `.env.render.example`; nhập giá trị thật trực tiếp trên Render:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `BACKEND_HOST` | `0.0.0.0` |
| `APP_ORIGIN` | Domain frontend thực tế, ví dụ `https://vothanhan.dev`; nếu chưa nối domain dùng `https://store-ga-u-muoi.vercel.app` |
| `DATABASE_URL` | Neon direct URL, username **store_app**, password là `STORE_APP_PASSWORD`, database/host lấy từ Neon, `sslmode=verify-full` |
| `BACKEND_PROXY_SECRET` | Khóa ngẫu nhiên từ 32 ký tự; Blueprint tự sinh, tạo thủ công thì tự đặt |
| `OWNER_TOTP_SECRET` | Secret đã thêm vào Authenticator |
| `OPENAI_API_KEY` | API key OpenAI |
| `STORE_AI_MODEL` | Model tài khoản được dùng, hỗ trợ Responses + Structured Outputs |
| `AI_DAILY_LIMIT` | `100` |

URL runtime ví dụ (không dùng giá trị mẫu):

```dotenv
DATABASE_URL=postgresql://store_app:MAT_KHAU_DA_URL_ENCODE@HOST_DIRECT.neon.tech/neondb?sslmode=verify-full
```

Dùng tên database thật nếu khác `neondb`. Không tắt kiểm tra TLS bằng `rejectUnauthorized:false`. Xóa các biến PGHOST/PGUSER/PGPASSWORD cũ nếu đã cấu hình theo database Render để tránh nhầm. Không copy admin connection string vào runtime; production sẽ từ chối role quyền quá lớn.

## 5. Kiểm tra và nối frontend

Deploy backend; mở `https://<backend>.onrender.com/healthz`, phải trả `{ "ok": true }`. API nghiệp vụ thiếu proxy secret phải bị từ chối. Free service có thể ngủ; chờ khởi động lại trước khi đăng nhập nếu lần đầu timeout.

Sau đó đặt `STORE_BACKEND_URL=https://<backend>.onrender.com` và cùng `BACKEND_PROXY_SECRET` ở frontend server. `APP_ORIGIN` hai bên phải giống domain frontend chính, không có dấu `/` cuối. Phần chuyển frontend sang host miễn phí sẽ xử lý riêng; không cần làm ở bước cấu hình backend này.

Hosting Free có hạn mức; API OpenAI có chi phí riêng. Vẫn cần backup độc lập. Chưa xác minh bằng tài khoản Neon/Render thật trong phiên này.

Tham chiếu: [Render Free](https://render.com/docs/free), [Neon roles](https://neon.com/docs/manage/roles), [Neon connections](https://neon.com/docs/get-started-with-neon/connect-neon).
