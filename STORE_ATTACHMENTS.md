# Gửi ảnh và tài liệu cho trợ lý cửa hàng

## Sử dụng

Trong trang store, bấm **Đính kèm**, kéo thả vào khung nhập hoặc dán ảnh từ clipboard. Có thể gửi chỉ tệp hoặc thêm câu hỏi. Bấm ảnh thu nhỏ để xem lớn, Esc để đóng, dấu X để bỏ tệp. Tệp chỉ được gửi khi bấm **Gửi tin nhắn**. Khi có lỗi, danh sách tệp và tin nhắn vẫn được giữ để sửa hoặc thử lại; không tự gửi lại.

AI đọc ảnh trực tiếp; tài liệu được backend trích xuất văn bản trước khi gửi cho AI. Tên tệp được ghi trong lịch sử hội thoại. Bản gốc và nội dung trích xuất không lưu vào database hoặc thư mục public. Nội dung gửi được chuyển qua nhà cung cấp AI đã cấu hình; không coi đây là cơ chế lưu tài liệu. Muốn đọc lại trong lượt sau, gửi lại tệp. Phiếu nháp đã tạo vẫn có thể sửa bằng hội thoại như trước.

## Hỗ trợ và giới hạn

| Định dạng | Cách đọc / giới hạn |
|---|---|
| PNG, JPG/JPEG, WEBP tĩnh | Đọc ảnh; kiểm tra nội dung thật, tối đa 20 triệu pixel; xoay đúng chiều, thu về tối đa 1800px, bỏ metadata và chuyển JPEG trước khi gửi |
| PDF | Văn bản có sẵn, tối đa 20 trang; trang không có chữ/bản scan được báo để gửi ảnh. Không đọc PDF có mật khẩu |
| XLSX | Tối đa 10 sheet, 2.000 dòng/sheet, 60 cột và tổng 12.000 ô. Không tính công thức; cần xuất bản chỉ có giá trị |
| DOCX | Trích văn bản; không thực thi macro, không mở đường dẫn ngoài. Hình trong Word không được đọc; gửi ảnh riêng |
| CSV, TXT | UTF-8; đọc dưới dạng văn bản, không thực thi công thức hoặc mã |

Tối đa **3 tệp/tin**, **2 MB/tệp**, tổng **2.800.000 byte/tin**. JSON chat tối đa 4 MiB qua cả proxy Vercel, backend và gateway. Tài liệu tối đa 24.000 ký tự/tệp, tổng 30.000 ký tự; vượt giới hạn được báo lỗi, không âm thầm cắt dữ liệu. Không hỗ trợ XLS/DOC cũ, tệp nén, âm thanh, video hoặc file thực thi.

Ảnh mờ, bảng lệch và thông tin thiếu cần hỏi lại. Tệp không có quyền xác nhận: AI chỉ đề xuất phiếu nháp, chủ cửa hàng phải nhấn xác nhận mới ghi sổ. Ảnh/file được xử lý trong worker riêng, giới hạn thời gian 20 giây và heap 128 MB, tối đa hai worker đồng thời. OOXML kiểm tra giới hạn số mục và số byte giải nén trước khi chuyển cho bộ đọc. Các giới hạn này là giới hạn ứng dụng, không phải toàn bộ khả năng của model GPT.

## Cập nhật khi đã deploy

1. **LOCAL:** chạy `npm ci` sau khi lấy mã mới. Tắt bằng `Tat-Chatbot.cmd`, rồi mở `Bat-Chatbot.cmd` để gateway nhận giới hạn mới.
2. **GitHub:** đẩy mã và `package-lock.json` mới. Không đẩy các file `.env` chứa bí mật.
3. **Render:** deploy backend từ commit mới để có worker, bộ đọc file và thư viện xử lý ảnh. Dockerfile hiện tại đã copy toàn bộ `backend/` và dependencies production.
4. **Vercel:** deploy frontend cùng commit để cập nhật bộ chọn file và proxy. Không cần thêm biến môi trường hoặc sửa schema database.

Các kiểm thử đọc ảnh/tài liệu dùng fixture cục bộ; kiểm thử AI dùng transport giả lập. Khả năng thị giác thực tế phụ thuộc model và phiên ChatMock, cần thử một ảnh hóa đơn không nhạy cảm sau khi deploy; chưa gửi ảnh cửa hàng thật qua tunnel trong quá trình phát triển.
