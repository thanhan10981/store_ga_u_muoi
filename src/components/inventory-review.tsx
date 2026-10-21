export type InventoryPayload = {
  type: "inventory";
  operation: "set_stock" | "rename_product" | "archive_product" | "restore_product";
  date: string; reason: string;
  before: { id: string; name: string; unit: string; stock: string; archived: boolean; revision: string };
  after: { id: string; name: string; unit: string; stock: string; archived: boolean; revision: string };
};

export const inventoryLabels = { set_stock: "Điều chỉnh tồn kho", rename_product: "Đổi tên mặt hàng", archive_product: "Xóa mặt hàng khỏi kho", restore_product: "Khôi phục mặt hàng" };

export function InventoryReview({ payload }: { payload: InventoryPayload }) {
  const number = (value: string) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(Number(value));
  return <>
    <span className="store-eyebrow">ĐỀ XUẤT SỬA KHO · CHƯA ÁP DỤNG</span>
    <h3>{inventoryLabels[payload.operation]}</h3>
    <p>{payload.before.name} · {payload.before.unit} · {payload.date}</p>
    <div className="store-table-wrap"><table><thead><tr><th>Thông tin</th><th>Trước</th><th>Sau xác nhận</th></tr></thead><tbody>
      <tr><td>Tên mặt hàng</td><td>{payload.before.name}</td><td>{payload.after.name}</td></tr>
      <tr><td>Tồn kho ({payload.before.unit})</td><td>{number(payload.before.stock)}</td><td>{number(payload.after.stock)}</td></tr>
      <tr><td>Trạng thái</td><td>{payload.before.archived ? "Đã xóa khỏi kho" : "Đang quản lý"}</td><td>{payload.after.archived ? "Đã xóa khỏi kho" : "Đang quản lý"}</td></tr>
    </tbody></table></div>
    <p><strong>Lý do:</strong> {payload.reason}</p>
    <p className="store-muted">{payload.operation === "archive_product" ? "Xác nhận sẽ đưa số tồn về 0 và ẩn mặt hàng. Lịch sử mua bán vẫn được giữ. Khôi phục sau đó không tự trả lại số lượng đã xóa." : payload.operation === "rename_product" ? "Tên mới được dùng khi hiển thị lịch sử của mặt hàng này. Không thay đổi đơn vị, số lượng hoặc số tiền đã ghi." : payload.operation === "restore_product" ? "Đưa mặt hàng trở lại danh sách quản lý. Số lượng đã xóa trước đó không được tự phục hồi." : "Đây là điều chỉnh kiểm kê, không tạo doanh thu hoặc chi phí. Không dùng thay cho ghi phiếu mua/bán."}</p>
    <p className="store-muted">Chỉ áp dụng sau khi bạn xác nhận. Nếu kho đã thay đổi hoặc sang ngày mới, hãy tạo lại đề xuất.</p>
  </>;
}
