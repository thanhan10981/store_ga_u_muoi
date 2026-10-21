# URL ChatMock cố định

Thiết lập một lần; sau đó nhấp đúp `Bat-Chatbot.cmd`. Laptop vẫn cần bật và có Internet.

## 1. Trên website Cloudflare

Nếu domain chưa dùng Cloudflare DNS: thêm `vothanhan.dev` vào tài khoản Cloudflare, chọn Free, kiểm tra đã có đủ bản ghi DNS hiện tại (đặc biệt frontend Vercel và email), rồi đổi nameserver tại nơi mua domain theo hai tên Cloudflare cung cấp. Đợi domain báo Active. Không thay tên miền bằng địa chỉ tunnel.

Vào **Networking → Tunnels → Create Tunnel**, đặt tên `ga-chatmock`. Chọn connector cloudflared nếu được hỏi. Trong bước Windows, lấy **chỉ token** từ cuối lệnh connector được hiển thị. Không chạy lệnh cài service khi dùng bộ khởi chạy này.

Thêm **Routes → Add route → Published application**:

| Mục | Điền |
|---|---|
| Subdomain | `chatmock` |
| Domain | `vothanhan.dev` |
| Path | Để trống |
| Service type | `HTTP` |
| Service URL | `127.0.0.1:8001` |

Giữ nguyên bản ghi frontend và backend đang dùng. Endpoint này có khóa gateway; Cloudflare Access dạng đăng nhập trình duyệt sẽ chặn Render nếu chưa tích hợp service token.

## 2. File LOCAL trên laptop

Copy `.env.chatmock-tunnel.example` thành `.env.chatmock-tunnel` cạnh `package.json`:

```dotenv
CHATMOCK_PUBLIC_URL=https://chatmock.vothanhan.dev
CLOUDFLARE_TUNNEL_TOKEN=TOKEN_LAY_TU_CLOUDFLARE
```

Không thêm `/v1` vào URL local này. Token tunnel khác `CHATMOCK_GATEWAY_SECRET`; không đổi khóa gateway. File thật đã được Git bỏ qua. Không gửi token lên GitHub hoặc vào chat.

Tắt bộ khởi chạy cũ bằng `Tat-Chatbot.cmd`, hoặc Ctrl+C trong các terminal đã mở thủ công. Nhấp đúp `Bat-Chatbot.cmd`. Bộ khởi chạy tự mở ChatMock, gateway và tunnel cố định; token được truyền bằng file, không đặt trực tiếp trong dòng lệnh. Khi xuất hiện **URL tunnel cố định**, connector đã kết nối Cloudflare; route DNS vẫn phải được cấu hình đúng như bước 1.

Nếu không có `.env.chatmock-tunnel`, bộ khởi chạy vẫn dùng URL tạm như trước. Nếu file có nhưng cấu hình sai, chương trình báo lỗi để sửa.

## 3. Trên website Render

Backend → Environment → Edit, đổi duy nhất:

```dotenv
CHATMOCK_BASE_URL=https://chatmock.vothanhan.dev/v1
```

Save và redeploy. Giữ `AI_PROVIDER=chatmock`, model và khóa gateway hiện tại. Vercel không cần sửa. Những lần sau chỉ bật `Bat-Chatbot.cmd`, không cần đổi URL Render.

Nguồn: [Cloudflare tạo tunnel và published application route](https://developers.cloudflare.com/tunnel/get-started/), [tham số token-file](https://developers.cloudflare.com/tunnel/reference/run-parameters/).
