# Chatbot quản lý cửa hàng gà ủ muối

**Phương án đã chọn: frontend Vercel, backend và PostgreSQL Render.** Làm theo [VERCEL_RENDER.md](VERCEL_RENDER.md). Phần Docker Compose bên dưới là phương án tự host thay thế; luồng nghiệp vụ và nguyên tắc bảo mật vẫn áp dụng.

## Kiến trúc và phạm vi

`Trình duyệt → Caddy HTTPS → Next.js frontend/proxy → Node.js backend → PostgreSQL 18`

Frontend và backend là hai container/tiến trình riêng. Chỉ Caddy công khai cổng 80/443. PostgreSQL và backend không publish cổng. Frontend không có API key AI hay mật khẩu database. Khóa proxy chỉ tồn tại ở server. Khi đặt `STORE_BACKEND_URL`, trang `/` chuyển sang quản lý cửa hàng; `/store` luôn mở giao diện này. Chat local cũ bị tắt API trong chế độ cửa hàng.

Bản này phục vụ **một chủ / một cửa hàng**. Có nhập hàng, bán hàng, chi phí, hao hụt; báo cáo ngày/tháng/năm, lọc tên hàng, tồn kho; AI phân tích/gợi ý theo dữ liệu truy vấn. Câu hỏi được chuyển thành tham số báo cáo có kiểm tra, không phải SQL tự do. Chưa có khách hàng, công nợ, nhiều nhân viên/phân quyền, định lượng chế biến, giá vốn FIFO/bình quân, hoàn trả hay sửa giao dịch đã chốt. Vì vậy chênh lệch thu chi **không phải lợi nhuận**. Hãy kiểm tra phạm vi này trước khi dùng làm sổ chính thức.

PostgreSQL không phải file `.db` mở trực tiếp. Dữ liệu bền vững nằm trong Docker volume `store_data` (PostgreSQL 18 dùng mount `/var/lib/postgresql`); bản sao lưu là file `.dump`. Không đồng bộ thư mục dữ liệu PostgreSQL đang chạy bằng OneDrive; dùng backup nhất quán bằng `pg_dump`.

## Luồng sử dụng

1. Đăng nhập bằng mật khẩu và mã Authenticator.
2. Nhắn: “Hôm nay nhập 30 con gà ủ muối giá 120k/con, 50 hộp giá 3k/hộp”. Nếu thiếu giá/số lượng/đơn vị, AI được hướng dẫn hỏi lại. Có thể trả lời bổ sung bằng tin tiếp theo.
3. Kiểm tra loại phiếu, ngày, tên, số lượng, đơn vị, **đơn giá** và tổng. Nhắn tiếp nếu muốn sửa. Phiếu mới hủy phiếu nháp trước; chỉ giữ một phiếu chờ xác nhận, hết hạn sau 24 giờ.
4. Nhấn **Xác nhận và ghi sổ**. API chỉ nhận ID phiếu; đọc dữ liệu đã lưu ở backend rồi ghi transaction, audit và đánh dấu đã chốt. Gửi lại cùng ID không ghi thêm. Nhắn “xác nhận” cho AI không tự ghi sổ.
5. Ghi bán hàng tương tự để có doanh thu. Nhập chi phí thuê mặt bằng/lương/vận chuyển dưới loại chi phí; ghi hỏng/mất bằng hao hụt (đơn giá 0).
6. Hỏi “Phân tích tháng này, ngày nào bán tốt, cần nhập thêm gì?” hoặc mở báo cáo không dùng AI.

Tồn kho nhận diện theo tên chuẩn hóa + đơn vị. “Gà nguyên liệu” khác “Gà ủ muối”; “con” khác “kg”, “hộp” khác “cái”. Dùng tên/đơn vị thống nhất. Không tự đổi nguyên liệu thành thành phẩm. Nhập số dư đầu kỳ bằng phiếu nhập có ghi chú trước khi ghi bán. Bán/hao hụt làm âm tồn tại bất kỳ ngày nào sẽ bị từ chối, kể cả phiếu ghi lùi ngày. Nếu một dòng lỗi, toàn bộ phiếu rollback.

## Deploy Docker trên máy chủ Linux

Cần Docker Engine + Compose, domain trỏ về máy chủ, cổng 80/443 mở cho Caddy cấp chứng chỉ. Chưa chạy được Docker trên máy làm việc hiện tại; các bước dưới cần xác minh trên staging trước khi mở dịch vụ thật.

1. Sao chép `.env.deploy.example` thành `.env.deploy`. Tạo ba giá trị ngẫu nhiên độc lập cho mật khẩu admin DB, runtime DB và khóa proxy. Không dùng các giá trị mẫu. Có thể chạy `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` cho từng giá trị. Giới hạn quyền đọc file môi trường bằng quyền hệ điều hành.
2. Tạo bí mật Authenticator bằng `node backend/admin.mjs totp` sau `npm ci`. Nhập secret vào ứng dụng Authenticator tin cậy (TOTP SHA1, 6 chữ số, 30 giây), rồi đặt `OWNER_TOTP_SECRET` trong `.env.deploy`. Đầu ra chứa bí mật: không gửi qua chat, lưu ảnh hoặc dùng dịch vụ QR công khai. Nếu máy chủ chưa có Node, dùng `docker build --target backend -t ga-store-admin .` rồi `docker run --rm ga-store-admin node backend/admin.mjs totp`.
3. Điền `STORE_DOMAIN` (chỉ hostname), `OPENAI_API_KEY`, `STORE_AI_MODEL`. Dùng model tài khoản của bạn được cấp quyền và hỗ trợ Responses API + Structured Outputs; backend không tự giả định model. Backend cửa hàng dùng API OpenAI chính thức. ChatMock vẫn ở chế độ chat local cũ, không được publish bởi cấu hình này. Không cần sửa `.env.local` cũ để deploy Docker.
4. Đặt `OWNER_USERNAME`, `OWNER_PASSWORD` từ 14–256 ký tự. Chạy:

```sh
docker compose --env-file .env.deploy build
docker compose --env-file .env.deploy up -d db
docker compose --env-file .env.deploy --profile tools run --rm admin
docker compose --env-file .env.deploy up -d backend frontend edge
```

5. Xóa `OWNER_PASSWORD` khỏi file sau bootstrap. Truy cập `https://<STORE_DOMAIN>`, đăng nhập bằng mật khẩu + Authenticator. Kiểm tra một phiếu nhỏ, xác nhận, tải lại trang, xem báo cáo rồi sao lưu/khôi phục thử.

Schema và role `store_app` được khởi tạo khi volume DB còn trống. Lần sau không tự chạy lại init script. Thay mật khẩu DB trong file không tự đổi mật khẩu role đang có; cần xoay mật khẩu trong PostgreSQL tương ứng. Không xóa volume để cập nhật.

Đổi mật khẩu chủ: đặt lại `OWNER_PASSWORD`, chạy lại service `admin` với cùng username. Tất cả phiên cũ bị thu hồi. Khi mất Authenticator, quản trị viên máy chủ phải xoay `OWNER_TOTP_SECRET`, restart backend và đổi mật khẩu để thu hồi phiên. Không có luồng khôi phục công khai hoặc mã dự phòng trong bản này.

## Chạy phát triển riêng frontend/backend

Node 24, PostgreSQL. Chạy `backend/admin.mjs migrate` bằng kết nối admin để tạo bảng, sau đó cấp quyền runtime như `deploy/02-runtime-role.sh`. Dùng kết nối admin để tạo owner, không dùng tài khoản admin chạy API lâu dài.

Sao chép `.env.backend.example` thành `.env.backend`, đặt kết nối runtime và thông tin AI. Thêm `STORE_BACKEND_URL=http://127.0.0.1:4000`, cùng `BACKEND_PROXY_SECRET`, `APP_ORIGIN=http://127.0.0.1:3000` vào `.env.local` của Next.js. Chạy `npm run backend:dev` và `npm run dev` ở hai terminal. Mở đúng `http://127.0.0.1:3000`; origin phải khớp. Để bootstrap local, chạy `npm run backend:migrate` / `npm run backend:owner` bằng môi trường admin riêng rồi chuyển lại runtime.

## Các lớp bảo vệ đã có

- HTTPS tại Caddy; HSTS; cookie phiên ngẫu nhiên 256 bit, HttpOnly, SameSite Strict, Secure + prefix `__Host-` trên production. DB chỉ lưu hash token; phiên hết hạn sau 8 giờ; logout thu hồi ở server.
- Mật khẩu hash scrypt có salt; production bắt buộc TOTP, cửa sổ lệch ±30 giây và chặn dùng lại mã. Đồng bộ giờ máy chủ bằng NTP.
- Kiểm tra Origin cố định cho mọi POST, CSRF token gắn phiên cho API đã đăng nhập, khóa proxy server-to-server. Backend không bật CORS công khai.
- Hạn mức đăng nhập dùng chung 8 lần/5 phút; API 120/phút/chủ; AI 10 yêu cầu/phút và mặc định 100 yêu cầu/24 giờ/chủ. Mỗi yêu cầu phân tích tối đa hai lần gọi AI, có token limit và timeout. Hạn mức lưu DB, dùng chung giữa các backend; khóa advisory chỉ cho một chat AI/chủ tại một thời điểm. Hạn mức lượt gọi không thay thế giới hạn chi tiêu của nhà cung cấp AI.
- Payload có giới hạn byte, schema strict, SQL có tham số. AI không có công cụ ghi database hay chạy SQL. Xác nhận là hành động người dùng riêng. Số tiền VND nguyên, số lượng tối đa ba số thập phân, làm tròn tiền từng dòng.
- Runtime DB role không superuser/DDL, không đổi owner, không UPDATE/DELETE sổ đã chốt và audit. Backend production từ chối khởi động khi role có các quyền quá lớn này. Mọi query nghiệp vụ kiểm tra owner ID. Đây là kiểm soát ở tầng ứng dụng, chưa có PostgreSQL RLS cho nhiều cửa hàng.
- Backend/frontend chạy non-root, filesystem read-only, bỏ Linux capabilities, giới hạn bộ nhớ/process; mạng DB nội bộ. Không log nội dung chat, mật khẩu hay lỗi upstream thô. Audit ghi tạo/xác nhận/hủy phiếu và đăng nhập thành công.
- UI hiển thị phản hồi AI như text, không thực thi HTML. CSP tại Caddy chặn framing/object/kết nối ngoài; còn `unsafe-inline` để tương thích Next.js hiện tại, chưa là CSP nonce nghiêm ngặt.

Không có hệ thống “bảo mật cao nhất” tuyệt đối. Trước mở Internet cần rà soát staging, vá host/images thường xuyên (tag image chưa khóa digest), giữ bí mật trong secret manager phù hợp, đặt hạn mức chi tiêu AI, backup mã hóa ngoài máy chủ và thử restore. Với dữ liệu kinh doanh, ưu tiên thêm VPN hoặc cổng truy cập có MFA phía trước. Giới hạn đăng nhập dùng chung có thể bị kẻ ngoài làm đầy; lớp VPN/access gateway giúp giảm bề mặt này. Chưa có kiểm thử xâm nhập độc lập/WAF hay theo dõi cảnh báo tự động. Dữ liệu câu hỏi và phần báo cáo được gửi đến nhà cung cấp AI để xử lý; `store:false` không đồng nghĩa không có mọi hình thức lưu giữ ở phía nhà cung cấp.

## Backup thành file và kiểm tra restore

Trên PowerShell: `./deploy/backup.ps1`. Script chạy `pg_dump -Fc` trong container rồi `docker compose cp` để giữ nguyên dữ liệu nhị phân. File ở `backups/store-<timestamp>.dump`, kèm SHA256. Không dùng `>` trong Windows PowerShell cũ để ghi dump nhị phân.

Trên Linux:

```sh
mkdir -p backups
docker compose --env-file .env.deploy exec -T db pg_dump -U postgres -d store -Fc -f /tmp/store-backup.dump
docker compose --env-file .env.deploy cp db:/tmp/store-backup.dump ./backups/store.dump
```

Kiểm tra restore vào **database mới**, không ghi đè dữ liệu đang bán hàng:

```sh
docker compose --env-file .env.deploy cp ./backups/store.dump db:/tmp/restore.dump
docker compose --env-file .env.deploy exec -T db createdb -U postgres store_restore_check
docker compose --env-file .env.deploy exec -T db pg_restore -U postgres --no-owner --no-acl --exit-on-error -d store_restore_check /tmp/restore.dump
docker compose --env-file .env.deploy exec -T db psql -U postgres -d store_restore_check -c 'SELECT count(*) FROM receipts;'
```

Mã hóa backup, lưu ngoài máy chủ, lên lịch hằng ngày và kiểm tra phục hồi định kỳ. Backup chứa cả dữ liệu kinh doanh, hash mật khẩu và phiên đăng nhập; bảo vệ như dữ liệu gốc. Sau khôi phục thực tế phải thu hồi phiên, cấp lại runtime grants và rà soát dữ liệu. Không chạy `docker compose down -v` vì sẽ mất volume.

## Xác minh

```sh
npm run typecheck
npm run lint
npm test
npm run test:backend
npm run build
npm run test:e2e
```

Backend integration test dùng PGlite (engine PostgreSQL nhúng), không phải mock SQL. HTTP auth/CSRF/MFA được chạy thật ở loopback; không thay thế kiểm tra đồng thời nhiều connection trên PostgreSQL server. Giao diện Playwright có test ghi rõ `simulated`, không gọi AI tính phí. Chưa xác minh AI thật, Docker Compose, chứng chỉ TLS, backup/restore và đồng thời nhiều connection trên môi trường deploy. Xem `STORE_VERIFICATION.md` cho kết quả chạy thực tế.

Tham chiếu: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html), [Docker PostgreSQL persistence](https://docs.docker.com/guides/postgresql/immediate-setup-and-data-persistence/), [Caddy request body limits](https://caddyserver.com/docs/caddyfile/directives/request_body).
