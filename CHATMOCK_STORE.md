# Dùng ChatMock cho chatbot cửa hàng trên Render

Backend đã có hai provider: `openai` và `chatmock`. Chọn provider trên **backend**, không phải trong file frontend Vercel. Mặc định vẫn là `openai` để không tự đổi cấu hình đang deploy.

Luồng dùng máy cá nhân:

`Web → backend Render (đăng nhập/CSRF/quyền) → HTTPS tunnel → gateway có khóa trên PC:8001 → ChatMock loopback:8000 → phiên ChatGPT`

Máy phải bật, không ngủ, có mạng; ChatMock, gateway và tunnel phải cùng chạy. Token ChatGPT chỉ ở máy cá nhân, không đưa lên Render, database, Git hoặc frontend. `OPENAI_API_KEY` thật không được gửi sang gateway.

## 1. Chạy ChatMock trên PC

Tại thư mục gốc dự án:

```powershell
python -m pip install ./ChatMock-main
python ChatMock-main/chatmock.py login
python ChatMock-main/chatmock.py serve --host 127.0.0.1 --port 8000 --reasoning-effort low --reasoning-summary none --no-enable-web-search --no-fast-mode
```

Giữ terminal chạy; xem model sẵn có tại `http://127.0.0.1:8000/v1/models`. Dùng đúng model ID này cho `STORE_AI_MODEL`. Không suy ra model từ nhãn giao diện hoặc tên ví dụ.

## 2. Chạy gateway có khóa riêng

Tạo khóa ngẫu nhiên mới, độc lập với khóa proxy frontend/backend:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy `.env.chatmock-gateway.example` thành `.env.chatmock-gateway`, điền:

```dotenv
CHATMOCK_GATEWAY_SECRET=KHOA_VUA_TAO
```

Mở terminal thứ hai, chạy:

```powershell
npm run chatmock:gateway
```

Gateway chỉ listen `127.0.0.1:8001`. Nó yêu cầu `x-chatmock-key`, chỉ nhận GET `/v1/models` và POST `/v1/responses`, không cho browser Origin, tắt tools và không chuyển tiếp cookie/token của caller. Có giới hạn request 128 KB, response 2 MB, 45 giây, một request đang xử lý và 60 lượt/phút.

## 3. Tạo tunnel từ Internet về gateway

Cần cài `cloudflared` trên máy. Với domain dùng DNS Cloudflare, làm theo [hướng dẫn Cloudflare](https://developers.cloudflare.com/tunnel/get-started/): tạo tunnel, cài connector theo lệnh của dashboard, thêm published application route. Ví dụ:

| Mục | Giá trị |
|---|---|
| Hostname | `chatmock.vothanhan.dev` (hoặc một subdomain bạn chọn) |
| Service URL | `http://127.0.0.1:8001` |

**Trỏ tunnel vào gateway cổng 8001**, không trỏ thẳng vào ChatMock 8000. Không thay bản ghi DNS frontend/backend đang hoạt động. `chatmock.vothanhan.dev` chỉ là tên đề xuất, chưa được tạo trong phiên làm việc này. Domain phải được cấu hình DNS Cloudflare theo yêu cầu của loại tunnel bạn dùng.

Để thử phát triển, sau khi cài cloudflared có thể chạy `cloudflared tunnel --url http://127.0.0.1:8001`; URL tạm đổi khi restart. Quick Tunnel không có cam kết uptime, không thay cho tunnel ổn định khi vận hành cửa hàng. Gateway vẫn kiểm tra khóa dù URL tunnel có thể bị người khác biết.

Nếu đặt thêm Cloudflare Access, cần cấu hình service-to-service phù hợp. Backend hiện hỗ trợ khóa gateway, chưa gửi service token của Cloudflare Access; bật Access dạng đăng nhập browser cho endpoint sẽ chặn request Render. Không bật log request body/Authorization hoặc chia sẻ token tunnel.

## 4. Chuyển backend Render sang ChatMock

Đẩy mã mới lên GitHub rồi cấu hình Render:

```dotenv
AI_PROVIDER=chatmock
CHATMOCK_BASE_URL=https://chatmock.vothanhan.dev/v1
CHATMOCK_GATEWAY_SECRET=KHOA_GIONG_FILE_TREN_PC
STORE_AI_MODEL=MODEL_ID_LAY_TU_CHATMOCK
```

Thay hostname và model bằng giá trị thật. Có thể xóa `OPENAI_API_KEY` trên Render khi đã chọn ChatMock. Giữ nguyên DATABASE_URL runtime, cookie/TOTP, APP_ORIGIN, BACKEND_PROXY_SECRET và AI_DAILY_LIMIT. Redeploy backend. Frontend không cần biết URL hoặc secret ChatMock.

Không dùng `CHATMOCK_BASE_URL=http://127.0.0.1:8000/v1` trên Render: localhost đó thuộc máy Render. Provider từ xa chỉ chấp nhận HTTPS + `/v1`, không nhận query/credential trong URL, không theo redirect mang khóa sang host khác.

## 5. Thử toàn bộ luồng

Đăng nhập web → hỏi một câu thiếu đơn giá để AI hỏi lại → nhập đủ thông tin → kiểm tra phiếu nháp → chỉ nhấn xác nhận khi đúng → xem báo cáo. Thử tắt gateway để kiểm tra lỗi kết nối không làm ghi giao dịch. Phiếu cũ vẫn có thể cần kiểm tra lại sau lỗi/mất mạng.

ChatMock không bảo đảm Structured Outputs như API chính thức. Backend gửi schema trong hướng dẫn và kiểm tra lại JSON bằng Zod; sai/mất JSON thì báo lỗi và không tạo giao dịch. Không tự retry gây trùng. Nguồn ChatMock hiện bỏ `max_output_tokens`; backend vẫn giới hạn byte/ký tự/thời gian nhưng không thể đảm bảo hạn mức token upstream. Hạn mức và hiệu lực phiên ChatGPT vẫn áp dụng.

Đã kiểm tra bằng test tự động với transport giả lập, gồm dummy auth, gateway access, giới hạn output và luồng lập phiếu. Chưa xác minh model/phản hồi ChatMock thực hoặc tunnel từ Render: lúc kiểm tra, ChatMock local chưa chạy và máy chưa có cloudflared.

## Chạy cả backend cửa hàng local, không qua Render

Trong `.env.backend` đặt `AI_PROVIDER=chatmock`, `CHATMOCK_BASE_URL=http://127.0.0.1:8000/v1`, `STORE_AI_MODEL` đúng model. Vẫn cần DATABASE_URL `store_app` và khóa proxy; chạy `npm run backend:dev`. Frontend local dùng STORE_BACKEND_URL trỏ `http://127.0.0.1:4000`, cùng khóa proxy và APP_ORIGIN. Trường hợp tất cả trên một máy không cần tunnel/gateway.
