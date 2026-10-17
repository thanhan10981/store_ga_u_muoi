# Mạch — Chatbot OpenAI bằng tiếng Việt

**Quản lý cửa hàng gà ủ muối:** deploy frontend Vercel, backend + PostgreSQL Render theo [VERCEL_RENDER.md](VERCEL_RENDER.md). Đã có `render.yaml`, `vercel.json` và công cụ khởi tạo database. [DEPLOYMENT.md](DEPLOYMENT.md) giải thích nghiệp vụ/bảo mật và phương án Docker Compose thay thế. Khi đặt `STORE_BACKEND_URL`, trang chính chuyển sang giao diện quản lý; `/store` mở giao diện cửa hàng. Hướng dẫn bên dưới dành cho chế độ chat local trước đây.

Next.js App Router, TypeScript, Tailwind CSS, SDK OpenAI chính thức và Responses API streaming. Chạy local trên Windows/macOS/Linux với Node.js **20.9+** (khuyến nghị Node 24) và npm.

## Kết nối ChatMock local (cấu hình hiện tại)

Mã nguồn bạn cung cấp nằm trong `ChatMock-main/`. API tương thích OpenAI là `http://127.0.0.1:8000/v1`, hỗ trợ `/models` và `/responses`. Mạch gọi qua backend; trình duyệt không giữ token ChatGPT hoặc gọi trực tiếp gateway.

```dotenv
AI_PROVIDER=chatmock
CHATMOCK_BASE_URL=http://127.0.0.1:8000/v1
OPENAI_MODEL=gpt-5.6-terra
```

ChatMock dùng phiên đăng nhập ChatGPT của chính nó, không dùng `OPENAI_API_KEY`. Mạch gửi một giá trị SDK giả định cố định `chatmock-local`, tuyệt đối không chuyển API key thật sang ChatMock. Đăng nhập theo luồng của ChatMock, không sao chép token vào `.env.local` hoặc vào chat. Nếu chưa có dependency Python 3.11+, cài bằng `python -m pip install ./ChatMock-main` (có thể dùng virtualenv).

Chạy từ thư mục gốc dự án, mỗi server một terminal:

```sh
# Chỉ cần nếu chưa đăng nhập hoặc phiên hết hạn; làm theo trang đăng nhập.
python ChatMock-main/chatmock.py login
# Gateway local, không bật verbose logging hoặc công cụ web.
python ChatMock-main/chatmock.py serve --host 127.0.0.1 --port 8000 --reasoning-effort low --reasoning-summary none --no-enable-web-search --no-fast-mode
```

Terminal khác: `npm run dev`, hoặc `npm run build` rồi `npm run start`. Mở **http://127.0.0.1:3000**. Cần giữ cả ChatMock (8000) và Mạch (3000) chạy. Có thể chọn Terra/Luna trên giao diện. Nhãn “ChatMock local” chỉ báo nguồn cấu hình, không khẳng định phiên còn hiệu lực.

ChatMock là dự án bên thứ ba, không phải API OpenAI chính thức. Bản nguồn này bỏ `max_output_tokens` trước khi chuyển lên ChatGPT, nên giới hạn 4.096 token phía upstream **không được đảm bảo ở chế độ ChatMock**; Mạch vẫn giới hạn 16.000 ký tự hiển thị, lịch sử và timeout 60 giây, hủy luồng khi chạm giới hạn. Chế độ này dùng reasoning `low` phù hợp registry ChatMock. Việc hủy kết nối không đảm bảo upstream ngừng xử lý tức thời. Chỉ chạy gateway trên loopback; không triển khai công khai.

## Chạy ứng dụng

```sh
npm install
```

Để dùng API OpenAI trực tiếp, sao chép `.env.example` thành `.env.local` khi chưa có file cấu hình, chọn `AI_PROVIDER=openai` và nhập key **trực tiếp trong file**, không gửi key qua chat:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.6-terra
```

PowerShell: `Copy-Item .env.example .env.local`. macOS/Linux: `cp .env.example .env.local`.

Nếu biến môi trường `OPENAI_API_KEY` đã có sẵn, ứng dụng sử dụng biến đó. `.env.local` và mọi `.env*` được Git bỏ qua, ngoại trừ `.env.example`. Không thêm tiền tố `NEXT_PUBLIC_` vào key. Không có ô nhập key trên giao diện, không lưu key vào trình duyệt và không log nội dung yêu cầu/lỗi gốc từ OpenAI.

```sh
npm run dev
```

Mở **http://127.0.0.1:3000**. Sau khi đổi biến môi trường, dừng server bằng Ctrl+C rồi chạy lại. Không có key vẫn mở được giao diện; gửi tin sẽ hiển thị lỗi cấu hình thật. Nhãn “Đã cấu hình API” chỉ cho biết có biến môi trường, không khẳng định key/số dư hợp lệ.

## Kiểm tra và production build

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

`npm run start` chạy bản production tại cùng địa chỉ local. Windows sandbox có thể cần cấp quyền tạo tiến trình con cho build/test. Tắt server đang chạy trước khi build lại. `npm run test:e2e` dùng Microsoft Edge đã cài; sửa `channel` trong `playwright.config.ts` thành `chrome` nếu dùng Chrome. Bộ kiểm tra tự khởi động production server nếu chưa chạy, cần build trước.

Server do bộ kiểm thử trình duyệt tự khởi động luôn chọn provider OpenAI với API key trống trong tiến trình kiểm thử để không phát sinh cuộc gọi tính phí hoặc gọi ChatMock; file `.env.local` của bạn được giữ nguyên. Hãy dừng server thường trước khi chạy bộ kiểm thử để dùng server kiểm thử riêng.

## Tính năng và giới hạn

- Tạo, tìm, mở lại, đổi tên, xóa hội thoại; chế độ sáng/tối; drawer trên điện thoại.
- Chọn **GPT-5.6 Terra** hoặc **GPT-5.6 Luna** ở thanh trên, dùng được cả trên điện thoại. Lựa chọn được lưu trong trình duyệt và áp dụng từ lần gửi/thử lại tiếp theo. Trong lúc đang trả lời, bộ chọn tạm khóa. `OPENAI_MODEL` đặt model mặc định khi chưa có lựa chọn trên trình duyệt; giá trị ngoài hai model này sẽ dùng Terra.
- Markdown, bảng GFM, code có nút sao chép. HTML thô bị bỏ qua; URL nguy hiểm bị lọc; ảnh từ AI không được tải tự động.
- Enter gửi, Shift+Enter xuống dòng, hỗ trợ IME; textarea tự tăng chiều cao; streaming, dừng, thử lại, sao chép câu trả lời; tự cuộn khi đang ở gần cuối.
- `localStorage` chỉ lưu hội thoại và giao diện trên trình duyệt/thiết bị hiện tại, **chưa đồng bộ**. Tối đa 50 hội thoại, 200 tin mỗi hội thoại, loại mục cũ nhất khi đầy. Khi bộ nhớ bị chặn/đầy, ứng dụng thông báo và tiếp tục trong bộ nhớ phiên. Hội thoại bị gián đoạn do tải lại được đánh dấu đã dừng.
- Khi gửi, backend chuyển nội dung và lịch sử gần nhất tới OpenAI; `store: false` không tạo trạng thái hội thoại lưu trữ qua Responses API. Điều này không đồng nghĩa miễn trừ mọi chính sách lưu giữ dữ liệu của OpenAI.
- Lịch sử gửi tối đa 20 tin và 24.000 ký tự, cắt theo tin nguyên vẹn, giữ câu hỏi mới nhất. Mỗi câu hỏi tối đa 6.000 ký tự, payload tối đa 100 KB. Khi gọi API OpenAI trực tiếp, đầu ra tối đa 4.096 token / 16.000 ký tự; giới hạn token bao gồm reasoning token. ChatMock bỏ giới hạn token upstream như đã nêu ở phần trên, nhưng giới hạn ký tự và timeout của Mạch vẫn áp dụng. Yêu cầu hết thời gian sau 60 giây; không tự retry gây phát sinh chi phí. Các giới hạn nằm trong `src/lib/limits.ts`.
- Backend chỉ nhận `{ messages: [{ role, content }], model?: "gpt-5.6-terra" | "gpt-5.6-luna" }`, kiểm tra role xen kẽ, từ chối model khác cùng key/tools/tham số tùy ý từ client. Reasoning là `none` khi gọi OpenAI trực tiếp, `low` khi dùng ChatMock. Phân biệt lỗi thiếu key, key sai, hết số dư, giới hạn tốc độ, model không khả dụng, mất mạng, timeout và luồng gián đoạn; riêng ChatMock có thông báo chưa đăng nhập/phiên hết hạn và gateway chưa chạy. Nút dừng hủy `fetch`, truyền AbortSignal tới SDK và đóng luồng; không đảm bảo hoàn phí token đã được xử lý trước khi hủy.
- Chỉ bind `127.0.0.1`, chặn Host public và Origin khác nguồn. Không có endpoint proxy công khai. Hạn mức trong bộ nhớ **dùng chung cho tiến trình local**: 10 lượt/phút, 2 yêu cầu đồng thời; reset khi server khởi động lại. Chưa có đăng nhập/hạn mức bền vững; **không triển khai công khai** trước khi bổ sung xác thực, hạn mức theo người dùng, ngân sách và rate limiter dùng chung.

## Kết quả kiểm chứng

Xem `VERIFICATION.md` để biết các bước đã chạy và phần chưa xác minh. Unit test dùng mock SDK; các test giao diện có nhãn `simulated` sử dụng transport kiểm thử riêng trong trình duyệt. Mã production không có câu trả lời giả và không có chế độ mock API. Chỉ có thể xác minh hội thoại OpenAI thật khi có key hợp lệ cùng hạn mức.

## Tài liệu tham chiếu

Đã đối chiếu tài liệu OpenAI chính thức ngày 16/10/2026:

- [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [SDK TypeScript/JavaScript: cancellation, timeout, retry](https://developers.openai.com/api/reference/typescript)
- [GPT-5.6 Terra: Responses, streaming, reasoning](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna: Responses, streaming, reasoning](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

Đổi `OPENAI_MODEL` giữa `gpt-5.6-terra` và `gpt-5.6-luna` rồi khởi động lại server để đặt mặc định, hoặc chọn trực tiếp trên giao diện mà không cần khởi động lại. API key cần có quyền truy cập model tương ứng.
"# store_ga_u_muoi" 
