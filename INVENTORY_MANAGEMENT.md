# Quản lý kho qua hội thoại

Chủ cửa hàng có thể yêu cầu:

- `Kiểm kê gà ủ muối đơn vị con, sửa tồn hiện tại thành 25 con.`
- `Đổi tên mặt hàng Hộp đơn vị cái thành Hộp đựng gà.`
- `Xóa mặt hàng Dưa leo đơn vị kg khỏi kho.`
- `Khôi phục mặt hàng Dưa leo đơn vị kg.`

AI lập một đề xuất cho một mặt hàng xác định. Khi có nhiều mặt hàng trùng tên hoặc khác đơn vị, phải hỏi rõ. Phiếu hiển thị tên, đơn vị, tồn kho và trạng thái trước/sau. Chỉ nút xác nhận của chủ mới áp dụng; tin nhắn hoặc chỉ dẫn trong ảnh/file không được tự xác nhận. Nhắn tiếp để sửa đề xuất hoặc bấm hủy như phiếu nhập hàng.

**Sửa tồn:** ghi chênh lệch kiểm kê ngày hôm nay, không tạo doanh thu/chi phí. Mua hoặc bán thực tế vẫn cần dùng phiếu nhập/bán. Chỉ chấp nhận số tồn không âm, tối đa ba chữ số thập phân và một tỷ đơn vị mỗi mặt hàng.

**Xóa khỏi kho:** đưa tồn về 0 và ẩn mặt hàng; vẫn giữ phiếu mua/bán, số tiền và lịch sử trước/sau. Khôi phục chỉ hiện lại mặt hàng, không tự trả lại số lượng đã xóa. Sau khi khôi phục, kiểm kê và xác nhận số tồn đúng nếu cần.

**Đổi tên:** dùng tên mới khi hiển thị cả giao dịch cũ của mặt hàng đó. Không đổi đơn vị hoặc tự gộp hai mặt hàng; thay đổi con/kg cần nghiệp vụ chuyển đổi riêng. Tên trùng mặt hàng khác cùng đơn vị bị từ chối.

Đề xuất giữ snapshot số tồn và phiên bản mặt hàng. Mọi ghi kho dùng chung khóa giao dịch; nếu có phiếu khác làm thay đổi kho trước khi xác nhận, hoặc đã sang ngày mới, đề xuất cũ bị từ chối và cần lập lại. Bấm xác nhận lặp cùng phiếu không nhân đôi thay đổi. Lịch sử thay đổi kho được ghi trong `inventory_changes` và `audit_events`, runtime chỉ được thêm/đọc lịch sử này.

Báo cáo thu/chi vẫn lấy từ các giao dịch thực. Tồn kho tính thêm các chênh lệch kiểm kê theo ngày. Danh sách dùng tên và trạng thái hiện tại nên mặt hàng đã ẩn không xuất hiện trong bảng tồn kho, kể cả chọn kỳ cũ; số tiền mua/bán lịch sử vẫn tính đủ. Danh mục AI tối đa 200 mặt hàng trong một lượt; AI được thông báo khi danh sách bị rút gọn.

## Nâng cấp bản đã deploy

1. **LOCAL, terminal tại thư mục dự án:** dùng file `.env.render-admin` hiện có, kết nối admin Neon và mật khẩu runtime hiện tại. Chạy:

   ```powershell
   npm run render:migrate
   ```

   Lệnh này thêm bảng/cột và cấp quyền nghiệp vụ cần thiết; không reset tài khoản chủ, không xóa dữ liệu, không thu hồi phiên đăng nhập. Chạy bằng admin để migrate; Render tiếp tục dùng `store_app`. Không sửa `DATABASE_URL` Render sang admin.

2. Đẩy code mới lên GitHub, deploy lại **Render** và **Vercel** sau khi migration thành công.
3. Thử một yêu cầu kiểm kê, đọc phiếu trước/sau rồi xác nhận. Không cần đổi biến môi trường hoặc cấu hình tunnel.

Không chạy lại `render:setup` chỉ để nâng cấp vì lệnh đó có bước tạo lại mật khẩu chủ và thu hồi phiên. Không cấp SUPERUSER hoặc quyền sửa/xóa trực tiếp sổ giao dịch cho AI. Các thao tác sửa/hủy phiếu giao dịch đã ghi sổ chưa thuộc nhóm thao tác kho này.
