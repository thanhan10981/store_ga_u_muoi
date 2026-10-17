# Frontend Vercel · Backend Render · PostgreSQL Render

Đây là phương án deploy chính theo lựa chọn của bạn. Không cần deploy Caddy hoặc chạy Docker Compose trên máy chủ. Vercel build Next.js; Render build **stage backend cuối cùng** trong Dockerfile hiện tại. Dockerfile vẫn hỗ trợ triển khai frontend bằng Docker nếu cần, nhưng Vercel không dùng stage đó.

Luồng: **Browser → HTTPS Vercel `/api/store/*` → HTTPS Render API → PostgreSQL nội bộ Render**.

Browser chỉ gọi Vercel. Vercel chuyển cookie/CSRF sang Render và trả Set-Cookie về browser. Cookie `__Host-store_session` thuộc domain Vercel, không cần cookie cross-site hay CORS `*`. Backend public trên Render bắt buộc khóa `BACKEND_PROXY_SECRET` cho mọi API nghiệp vụ; `/healthz` chỉ kiểm tra kết nối và trả `{ok:true}`. Origin được kiểm tra là domain frontend chính xác.

## 1. Tạo project Vercel để lấy domain

Đẩy mã lên repository Git riêng, import vào Vercel. Chọn Next.js, root directory là thư mục có `package.json`, Node 24, build `npm run build`, install `npm ci`; giữ Output Directory mặc định. `vercel.json` đã khai báo build. Lấy domain production ổn định, ví dụ `https://your-shop.vercel.app`; nếu có custom domain, dùng domain chính đó ngay từ đầu.

Trên Vercel, trang chủ luôn hiển thị màn hình đăng nhập quản lý; có thể truy cập trực tiếp `/login` hoặc `/store`. Lần deploy đầu chưa cấu hình backend sẽ thấy thông báo chưa kết nối backend, chưa thể đăng nhập. Thêm biến production ở bước 4 rồi redeploy. Không gắn database và secret production cho Preview deployments; preview frontend cần backend/database staging riêng nếu muốn đăng nhập thử.

## 2. Render Blueprint: backend và database

Render → New → Blueprint → chọn cùng repo, dùng `render.yaml`. File tạo một Web Service Docker và PostgreSQL 18 cùng region Singapore, cả hai có **`plan: free`** theo lựa chọn hiện tại. Không có tài nguyên nào đã được tạo từ máy này. Kiểm tra cả hai tài nguyên hiển thị Free trước khi tạo; không nhập thông tin thanh toán để tiếp tục một cấu hình vẫn hiện Paid.

Giới hạn Free theo [Render](https://render.com/docs/free): backend ngủ sau 15 phút không có traffic, lần gọi đầu có thể chờ khoảng một phút; PostgreSQL Free giới hạn 1 GB, mỗi workspace chỉ có một DB Free và **hết hạn sau 30 ngày**. DB hết hạn không truy cập được; nếu không nâng cấp, dữ liệu sẽ bị xóa sau thời gian gia hạn 14 ngày. Cần xuất dữ liệu trước hạn hoặc chuyển database sang nơi khác nếu muốn tiếp tục miễn phí; đây không phải PostgreSQL miễn phí lâu dài. Backend ngủ có thể khiến lần đăng nhập/chat đầu timeout, hãy chờ backend thức rồi thử lại; không tự retry thao tác xác nhận giao dịch.

Gói hosting Free không làm API OpenAI miễn phí; API key backend vẫn có chi phí/hạn mức riêng. Không publish ChatMock local để thay thế cấu hình API này.

Điền các giá trị Render yêu cầu:

| Biến backend | Giá trị |
|---|---|
| `APP_ORIGIN` | `https://your-shop.vercel.app`, không có `/` cuối |
| `PGPASSWORD` | Mật khẩu ngẫu nhiên 32+ ký tự bạn tạo cho **store_app**, giữ lại cho bước 3 |
| `OPENAI_API_KEY` | Key AI, chỉ lưu Render |
| `STORE_AI_MODEL` | Model có quyền dùng Responses + Structured Outputs |
| `OWNER_TOTP_SECRET` | Secret từ `node backend/admin.mjs totp`, nhập vào Authenticator |

`PGHOST/PGPORT/PGDATABASE` được Blueprint lấy từ DB nội bộ; `PGUSER=store_app`. `BACKEND_PROXY_SECRET` do Render sinh, bạn chép giá trị đó vào Vercel ở bước 4. Không thêm `DATABASE_URL` admin vào backend; nếu đã có, xóa vì nó ưu tiên hơn các biến PG*. Backend lắng nghe `0.0.0.0:$PORT`, Render cấp PORT.

**Deploy backend đầu tiên sẽ chưa thành công cho đến khi database được khởi tạo ở bước 3.** Đây là điều kiện bảo vệ có chủ đích: server production không tự dùng tài khoản quản trị hoặc tự tạo bảng khi khởi động. Sau bước 3, chạy Manual Deploy lại backend.

Nếu tạo thủ công thay Blueprint: tạo DB và Web Service cùng region, Dockerfile Path `./Dockerfile`, Docker Context `.`, không override Docker Command, Health Check Path `/healthz`; điền các biến tương tự. Runtime dùng host kết nối nội bộ trực tiếp, không dùng PgBouncer transaction pooling vì hệ thống có session advisory lock cho chat.

## 3. Khởi tạo schema, runtime role và chủ cửa hàng

Thực hiện trên máy của bạn với Node 24 và `npm ci`; không đưa tài khoản quản trị vào service API.

1. Render Postgres → Networking: tạm thời cho phép **chỉ IP public hiện tại của bạn `/32`** để chạy bootstrap từ local. Blueprint ban đầu chặn toàn bộ external DB bằng `ipAllowList: []`. Không mở `0.0.0.0/0`.
2. Sao chép `.env.render-admin.example` thành `.env.render-admin`. Điền:
   - `DATABASE_URL`: **External Database URL** của Render, thêm `?sslmode=verify-full` (nếu URL đã có query, dùng `&sslmode=verify-full`). Dùng credential quản trị Render ở đây.
   - `STORE_APP_PASSWORD`: cùng giá trị `PGPASSWORD` đã đặt cho backend, từ 32 ký tự trở lên.
   - `OWNER_USERNAME`, `OWNER_PASSWORD`: tài khoản chủ cửa hàng, mật khẩu từ 14 ký tự.
3. Chạy `npm run render:setup`.
4. Script tạo schema, tạo/cập nhật `store_app`, cấp quyền giới hạn và tạo owner; không in credential/kết nối thô. Cần tài khoản bootstrap có quyền tạo role và cấp quyền trên schema. Nếu Render account không cấp quyền tạo role, cần cấu hình role tương đương qua quản trị database; không chuyển API sang tài khoản quản trị để né kiểm tra.
5. Xóa quyền truy cập external `/32` vừa thêm, đưa lại external allow list rỗng. Xóa file `.env.render-admin` hoặc chuyển credential vào kho bí mật bảo vệ. Xóa cả `OWNER_PASSWORD` khỏi môi trường terminal nếu có đặt.
6. Manual Deploy lại backend Render. Kiểm tra `https://<backend>.onrender.com/healthz` trả 200 `{ok:true}`. Truy cập trực tiếp API nghiệp vụ không có khóa phải trả 403.

Script có thể chạy lại bằng cùng username để cập nhật schema/quyền, đổi mật khẩu chủ và thu hồi phiên cũ. Nó cũng xoay mật khẩu `store_app` về giá trị bạn cung cấp; khi đổi giá trị này phải cập nhật `PGPASSWORD` backend rồi redeploy. Đây là công cụ admin thủ công, không phải migration tự động mỗi lần deploy.

## 4. Biến môi trường Vercel

Project → Settings → Environment Variables → chỉ chọn **Production**:

```dotenv
APP_ORIGIN=https://your-shop.vercel.app
STORE_BACKEND_URL=https://ga-u-muoi-api.onrender.com
BACKEND_PROXY_SECRET=<copy chính xác từ backend Render>
```

Tham khảo `.env.vercel.example`. Tất cả là biến server; **không thêm `NEXT_PUBLIC_`**. Không đặt `OPENAI_API_KEY`, `DATABASE_URL`, `PGPASSWORD` hoặc `OWNER_TOTP_SECRET` lên frontend. Redeploy Vercel sau khi thêm/đổi biến.

Proxy đã khai báo `maxDuration=120` giây cho Vercel, timeout kết nối backend 110 giây. Gói/cấu hình Vercel cần hỗ trợ thời lượng này, bật Fluid compute nếu phù hợp. HTTPS Render URL là bắt buộc trên Vercel. Các security header trước ở Caddy đã được bổ sung vào Next.js để vẫn áp dụng khi chạy Vercel.

## 5. Kiểm tra sau deploy

- Đăng nhập tại domain production bằng mật khẩu + mã Authenticator; kiểm tra cookie có `Secure`, `HttpOnly`, `SameSite=Strict`, không có Domain attribute.
- Nhập phiếu thử nhỏ → chưa xác nhận thì báo cáo chưa thay đổi → xác nhận → tải lại → chỉ có một giao dịch.
- Kiểm tra logout/phiên hết hạn, phiếu bán vượt tồn, thay phiếu nháp và báo cáo ngày/tháng/năm.
- Khi đổi custom domain: cập nhật `APP_ORIGIN` cả Vercel và Render, redeploy hai bên, dùng một domain chính và đăng nhập lại. Không dùng wildcard `*.vercel.app` làm origin.
- Bật backup/retention phù hợp trên Render, giữ thêm bản sao lưu mã hóa độc lập và thử restore. Script `deploy/backup.ps1` cũ dành cho Docker Compose, không dùng cho Render. Nếu dùng `pg_dump` từ local, cần máy có PostgreSQL client phù hợp, kết nối external TLS và chỉ mở IP `/32` trong thời gian cần thiết; không coi filesystem tạm thời của Web Service là nơi backup bền vững.

Đã kiểm tra locally: health check không lộ dữ liệu, cấp/xoay quyền runtime, proxy Vercel từ chối backend HTTP và giữ CSRF/session. Chưa tạo project Vercel/Render hoặc thực hiện deploy thật vì chưa có kết nối tài khoản/domain của bạn trong phiên làm việc này. Kiểm tra thực tế trên Render vẫn cần thiết cho role privileges, TLS, Blueprint, giới hạn function và AI model.

Tham chiếu chính thức: [Render Blueprint](https://render.com/docs/blueprint-spec), [Render Postgres connections](https://render.com/docs/postgresql-creating-connecting), [Render health checks](https://render.com/docs/health-checks), [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).
