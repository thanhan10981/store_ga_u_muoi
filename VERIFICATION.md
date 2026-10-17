# Kiểm chứng ngày 16/10/2026

Môi trường: Windows, Node 24.15.0, npm 11.11.0; trình duyệt Microsoft Edge headless.

## Các kiểm tra tự động

- `npm run typecheck`: thành công.
- `npm run lint`: thành công, không có cảnh báo/lỗi lint.
- `npm test`: 16/16 kiểm thử thành công.
- `npm run build`: production build thành công, các route `/` và `/api/chat` chạy server-side.
- `npm run test:e2e`: 6/6 kiểm thử trình duyệt thành công.
- `npm audit --omit=dev`: 0 lỗ hổng trong dependency production.

## Phạm vi đã xác minh

- Giao diện desktop 1280×720 và mobile 390×844; không tràn ngang trên mobile; textarea tự tăng chiều cao, Enter/Shift+Enter, menu mobile, dialog và chế độ tối.
- Gọi endpoint local thật khi chưa có key nhận đúng lỗi `MISSING_API_KEY` và không gọi OpenAI.
- Tạo, chọn, đổi tên, xóa hội thoại; mở lại sau reload; lịch sử lỗi và nội dung dở dang được giữ; theme được giữ sau reload.
- Với transport mô phỏng **chỉ ở bộ test**: nội dung xuất hiện theo từng phần, trạng thái đang trả lời, dừng thực sự abort signal, giữ nội dung dở dang, thử lại không nhân đôi câu hỏi, truyền các lượt trước trong request.
- Markdown, bảng, code, nút sao chép code hoạt động; HTML script và URL `javascript:` không được thực thi/render nguy hiểm.
- Với mock SDK trong unit test: payload Responses cố định, model từ env, context được truyền, `store: false`, giới hạn token, các lỗi giữa luồng, timeout abort SDK, giới hạn 10 yêu cầu/phút, kiểm tra role/kích thước/Host/Origin.
- Bộ kiểm tra có ca hồi quy cho Next.js chuẩn hóa URL nội bộ `localhost` trong khi Host và Origin trình duyệt là `127.0.0.1`.

Ảnh QA: `artifacts/desktop.png`, `artifacts/mobile.png`, `artifacts/mobile-dark.png`.

## Chưa xác minh

Không có `OPENAI_API_KEY` trong môi trường lúc triển khai. **Chưa thực hiện cuộc gọi OpenAI thật**, chưa xác minh quyền model, số dư, streaming/ngữ cảnh và hủy ở phía dịch vụ OpenAI thật. Hãy nhập key vào `.env.local`, khởi động lại server rồi trò chuyện để xác minh các phần này. Key không được yêu cầu gửi qua chat và không có câu trả lời giả trong ứng dụng.

## Dependency phát triển

`npm audit` toàn bộ ghi nhận 5 cảnh báo high liên quan chuỗi `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (GHSA-vfj7-8cjw-p6xm). Đây là công cụ lint phát triển, không nằm trong dependency production, chỉ xử lý glob của repository. Phiên bản `braces` mới nhất trên registry lúc kiểm tra là 3.0.3, chưa có bản vá khả dụng. Không áp dụng `npm audit fix --force` vì đề xuất hạ major của cấu hình Next.js; cần cập nhật chuỗi dependency khi có bản vá tương thích.

Rate limiter hiện tại chỉ dùng bộ nhớ của một tiến trình local; chưa có xác thực hay hạn mức bền vững cho triển khai công khai. Ứng dụng chưa được deploy và server chỉ bind loopback.

## Cập nhật bộ chọn model Terra/Luna

- Chỉ hỗ trợ `gpt-5.6-terra` và `gpt-5.6-luna`; Terra là mặc định, có thể đổi mặc định bằng `OPENAI_MODEL` hoặc chọn trực tiếp trên giao diện.
- Backend kiểm tra model theo enum trước khi gọi SDK; vẫn từ chối mọi key/tools/tham số khác do client truyền lên. Cả hai model dùng Responses streaming, `reasoning.effort: "none"`, giới hạn đầu ra và khả năng hủy như trước.
- Typecheck, lint và production build: thành công.
- Unit test: **19/19 đạt**, có ca kiểm tra định tuyến cả hai model và chặn model không được phép.
- Kiểm thử Edge: **7/7 đạt**, gồm chọn model, giữ lựa chọn sau reload, truyền đúng model khi gửi, khóa bộ chọn lúc streaming và chọn trên màn hình 320 px không tràn ngang.
- Bộ test tự khởi động server với API key trống trong môi trường tiến trình kiểm thử; không sửa key trong `.env.local` và không phát sinh gọi API tính phí từ các test tự động này.
- Sau khi khởi động lại server thật: trang chủ trả HTTP 200. Một smoke test gọi `gpt-5.6-terra` qua `/api/chat` với key hiện tại nhận **HTTP 401** (`INVALID_KEY`, theo ánh xạ lỗi backend). Chưa xác minh hội thoại thật thành công. Không thử tiếp Luna vì hai model dùng cùng key. Cần kiểm tra lại key OpenAI; nếu dùng nhà cung cấp trung gian thì cần đúng endpoint của nhà cung cấp. Key và nội dung file môi trường không được đưa vào log/kết quả kiểm thử.

## Tích hợp ChatMock local — đã xác minh trả lời thật

Các giới hạn xác minh ở những mục trên ghi lại giai đoạn dùng API key trực tiếp. Bản hiện tại chọn `AI_PROVIDER=chatmock` và đã xác minh luồng ChatMock thật:

- Đã đọc mã nguồn được cung cấp trong `ChatMock-main/chatmock/`, đặc biệt `app.py`, `routes_openai.py`, `responses_api.py`, `upstream.py`, `model_registry.py`, `reasoning.py` và hướng dẫn khởi động/xác thực.
- ChatMock chạy từ đúng mã nguồn local trên `127.0.0.1:8000`; `/health` trả HTTP 200; `/v1/models` trả `gpt-5.6-terra` và `gpt-5.6-luna`.
- Gọi thẳng `/v1/responses` của ChatMock với Terra: HTTP 200, có text delta và `response.completed` thật.
- Mạch production chạy tại `http://127.0.0.1:3000`, HTTP 200, giao diện có nhãn `ChatMock local`.
- Gửi ba tin user/assistant/user tới backend `/api/chat` của Mạch qua từng model để hỏi lại nhãn kiểm thử có trong lượt trước:

| Model | HTTP | Text delta | Hoàn tất | Nhớ đúng ngữ cảnh |
| --- | --- | --- | --- | --- |
| `gpt-5.6-terra` | 200 | 5 | Có | Có |
| `gpt-5.6-luna` | 200 | 5 | Có | Có |

Đây là phản hồi thực từ ChatGPT qua ChatMock, không dùng mock SDK/transport trong các smoke test này. Chỉ in trạng thái, số sự kiện và kết quả boolean; không in token hay nội dung file môi trường.

- Typecheck, lint, production build: thành công.
- Unit test: **25/25 đạt**, bổ sung xác thực ChatMock, giới hạn URL loopback và kiểm tra không chuyển API key OpenAI thật sang gateway.
- Edge E2E: **7/7 đạt**, dùng server kiểm thử riêng chọn OpenAI với key trống để không tiêu thụ hạn mức ChatGPT trong suite tự động.
- API key cũ được giữ nguyên trong `.env.local` nhưng không dùng khi chọn ChatMock. Node không đọc/copy token OAuth; ChatMock dùng cơ chế phiên đăng nhập của nó. Không bật verbose logging.
- ChatMock trong bản nguồn này bỏ `max_output_tokens`; do đó cap 4.096 token upstream không áp dụng. Mạch vẫn chặn 16.000 ký tự và timeout 60 giây. Hủy luồng không đảm bảo upstream ngừng xử lý tức thời; chưa xác minh thời điểm hủy ở máy chủ ChatGPT.
- Cả hai server chỉ bind loopback, không triển khai công khai. Cần giữ cả cổng 3000 và 8000 chạy khi sử dụng.
