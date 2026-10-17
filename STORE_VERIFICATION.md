# Kết quả xác minh quản lý cửa hàng — 17/10/2026

## Cập nhật đăng nhập

- Vercel luôn hiển thị luồng đăng nhập ở `/`, kể cả khi chưa cấu hình Render; thêm `/login`. Chat local cũ vẫn dùng được khi phát triển local, API chat cũ bị tắt trên Vercel.
- Form đăng nhập riêng có tên tài khoản, mật khẩu, hiện/ẩn mật khẩu và mã Authenticator. Chỉ mở khu quản lý sau khi đăng nhập và kiểm tra lại phiên thành công.
- `npm test`: 32 test đạt; build production và ESLint các file thay đổi đạt.
- Playwright cửa hàng: 2 test đạt, gồm sai mật khẩu, từ chối phiên chưa xác minh, hiện/ẩn mật khẩu và luồng xem/xác nhận phiếu. Đã kiểm tra ảnh `artifacts/store-login.png`.
- Xác thực thực tế vẫn cần backend Render, schema/owner đã khởi tạo và các biến môi trường; không có tài khoản/mật khẩu mặc định hoặc cơ chế đăng nhập giả.

## Cập nhật Vercel + Render

- Thêm `render.yaml` (API Docker + PostgreSQL cùng region, external DB access mặc định tắt), `vercel.json`, biến môi trường mẫu và [VERCEL_RENDER.md](VERCEL_RENDER.md).
- Build với `VERCEL=1`: đạt; Vercel dùng output Next.js mặc định, Docker vẫn có standalone output.
- `npm test`: 29 test đạt, gồm kiểm tra proxy Vercel từ chối backend HTTP/URL sai định dạng.
- `npm run test:backend`: 11 test đạt, có health check không cần secret nhưng không trả dữ liệu cửa hàng; script Render cấp quyền và xoay mật khẩu runtime được chạy với PostgreSQL nhúng.
- ESLint các file thay đổi và kiểm tra cú pháp setup script: đạt.
- Chưa tạo tài nguyên, xác thực Blueprint trên Render hoặc deploy tài khoản Vercel/Render thật. Script khởi tạo cần được xác minh với quyền admin thực tế của database Render. Theo yêu cầu miễn phí, cả backend và DB trong Blueprint đã đổi thành `plan: free`; PostgreSQL Render Free hết hạn sau 30 ngày, không phải miễn phí lâu dài.

## Đã chạy

- `npm run typecheck`: đạt sau khi Next.js sinh lại route types.
- `npm run lint`: đạt.
- `npm test`: 28 test đạt (25 chatbot cũ, 3 kiểm tra proxy mới).
- `npm run test:backend`: 11 test đạt với engine PostgreSQL nhúng PGlite. Kiểm tra schema, số tiền/làm tròn, phiếu nháp không ảnh hưởng báo cáo, xác nhận idempotent, rollback nhiều dòng khi âm kho, giao dịch lùi ngày, đơn vị khác nhau, owner scope, phiếu hết hạn/hủy, SQL injection dạng chuỗi dữ liệu, hạn mức bền vững, HTTP login/logout/CSRF/MFA/chặn replay, đầu ra AI không hợp lệ, thay phiếu nháp và quyền runtime theo script deploy.
- `npm run build`: production build đạt; các route `/`, `/store`, `/api/store/[...path]`, `/api/chat` được tạo.
- `npm run test:e2e`: 8 test đạt với Edge. Có 1 luồng cửa hàng `simulated`: đăng nhập, xem phiếu gồm gà và hộp, xác nhận, xem báo cáo, logout; kiểm tra không tràn ngang ở 390px. 7 test còn lại giữ kiểm tra giao diện chatbot cũ.
- Đã mở và kiểm tra ảnh `artifacts/store-desktop.png`, `artifacts/store-mobile.png`.
- `npm audit --omit=dev`: 0 lỗ hổng được báo tại thời điểm kiểm tra. Full audit còn **5 cảnh báo high thuộc dependency công cụ phát triển**: chuỗi `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. Registry hiện trả `braces@3.0.3` là bản mới nhất và audit chưa đưa cách vá tương thích; không hạ Next/ESLint major hoặc chạy `audit fix --force`. Cần theo dõi bản vá, kể cả môi trường CI/build. Runtime image đã prune devDependencies.

## Giới hạn xác minh

- Máy chưa cài Docker hoặc PostgreSQL server; chưa chạy Compose, init container, cấp chứng chỉ TLS, backup/restore và kiểm tra đồng thời nhiều DB connection. PGlite không chứng minh hành vi tranh chấp khóa giữa nhiều tiến trình; mã dùng transaction + advisory lock + unique draft ID và vẫn cần test staging thật.
- Test AI dùng client giả lập được truyền vào hàm test; không có mock mode trong môi trường ứng dụng. Chưa gọi AI thật để xác minh model/schema, hiểu câu tiếng Việt nhiều lượt hoặc chất lượng khuyến nghị. Cần API key, model được cấp quyền và dữ liệu thử riêng; không đưa dữ liệu thật vào test hiện tại.
- Chưa triển khai lên máy chủ bên ngoài, chưa có penetration test độc lập hoặc khẳng định an toàn tuyệt đối.
- `.env.local` và ChatMock credential hiện có không được đọc hoặc thay đổi. Tài liệu local cũ được giữ, chế độ cửa hàng dùng cấu hình backend riêng.

Quy trình chạy và điều kiện trước public deploy nằm trong [DEPLOYMENT.md](DEPLOYMENT.md).
