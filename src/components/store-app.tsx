"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LoginPage } from "./login-page";
import { StoreAttachments, useAttachmentPicker, type ChatAttachment } from "./store-attachments";
import { InventoryReview, inventoryLabels, type InventoryPayload } from "./inventory-review";
import { StoreToastStack, type ToastItem } from "./store-toast";
import "./store.css";

type Line = { name: string; unit: string; quantity: number; unitPrice: number };
type Draft = { id: string; payload: { type?: "receipt"; kind: string; date: string; note: string; lines: Line[] } | InventoryPayload };
type Report = {
  revenue: string; purchases: string; expenses: string; cashDifference: string; note: string;
  query: { from: string; to: string; item: string; bucket: string };
  inventory: { name: string; unit: string; stock: string }[];
  series: { period: string; kind: string; amount: string }[];
  products: { name: string; unit: string; kind: string; quantity: string; amount: string }[];
  truncated: { products: boolean; inventory: boolean };
};
type Message = { role: string; content: string };
type Session = { username: string; csrf: string; draft?: Draft; messages?: Message[] };
const labels: Record<string, string> = { purchase: "Nhập hàng", sale: "Bán hàng", expense: "Chi phí", waste: "Hao hụt" };
const money = (n: number | string) => `${new Intl.NumberFormat("vi-VN").format(typeof n === "string" && /^-?\d+$/.test(n) ? BigInt(n) : Number(n))} ₫`;
const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function StoreEmblem() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeOpacity=".25" />
    <path d="M32 5 55 18v28L32 59 9 46V18Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M32 13 48 22v20L32 51 16 42V22Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".4" />
    <path d="M39 26a10 10 0 1 0 2 12v-6H31" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="55" cy="18" r="3" fill="currentColor" />
  </svg>;
}

export function StoreApp() {
  const [user, setUser] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bucket, setBucket] = useState("day");
  const [item, setItem] = useState("");

  const addToast = useCallback((type: "error" | "notice" | "info", message: string, title?: string) => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, type, message, title }]);
  }, []);

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  const setError = useCallback((msg: string) => {
    if (msg) addToast("error", msg, "Lỗi thao tác");
  }, [addToast]);
  const picker = useAttachmentPicker(attachments, setAttachments, setError);

  function setNotice(msg: string) {
    if (msg) addToast("notice", msg, "Thông báo hệ thống");
  }

  useEffect(() => {
    fetch("/api/store/session", { cache: "no-store" }).then(async response => {
      const today = localToday(); setTo(today); setFrom(`${today.slice(0, 7)}-01`);
      const data = await response.json();
      if (response.ok) { setUser(data); setDraft(data.draft); setMessages(data.messages ?? []); }
      else if (response.status !== 401) setError(data.error ?? "Không kết nối được backend.");
    }).catch(() => setError("Không kết nối được backend.")).finally(() => setLoading(false));
  }, [setError]);

  async function api(path: string, body: unknown) {
    const response = await fetch(`/api/store/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": user?.csrf ?? "" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.status === 401) { setUser(null); setMessages([]); setDraft(null); setReport(null); setAttachments([]); }
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Yêu cầu không thành công.");
    return data;
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi kết nối. Hãy tải lại để kiểm tra phiếu."); }
    finally { setBusy(false); }
  }

  function send(event: FormEvent) {
    event.preventDefault(); if (picker.reading || (!input.trim() && !attachments.length)) return;
    const message = input.trim();
    void run(async () => {
      const result = await api("chat", { message, attachments });
      const sent = `${message || "Đọc tệp đính kèm"}${attachments.length ? `\n[Đính kèm: ${attachments.map(file => file.name).join(", ")}]` : ""}`;
      setMessages(old => [...old, { role: "user", content: sent }, { role: "assistant", content: result.answer }]);
      setInput(""); setAttachments([]);
      if (result.draft) setDraft(result.draft);
      if (result.report) setReport(result.report);
    });
  }

  if (!loading && !user) return (
    <>
      <StoreToastStack toasts={toasts} onDismiss={dismissToast} />
      <LoginPage />
    </>
  );

  return (
    <main className="store-shell">
      <div className="store-aurora" aria-hidden="true"><i /><i /><i /><div /></div>
      {/* Thông báo nổi dạng Toast ghim góc trên, không làm giật layout */}
      <StoreToastStack toasts={toasts} onDismiss={dismissToast} />

      <header className="store-header">
        <div className="store-header-left">
          <div className="store-header-logo"><StoreEmblem /></div>
          <div>
            <span className="store-eyebrow">GÀ · KHÔNG GIAN QUẢN LÝ</span>
            <h1>Gà ủ muối</h1>
            <p>Nhập hàng, theo dõi buôn bán, hiểu cửa hàng qua hội thoại.</p>
          </div>
        </div>
        {user && (
          <div className="store-account">
            <span className="store-user"><span className="store-avatar">{user.username.slice(0, 1).toUpperCase()}</span>{user.username}</span>
            <button
              disabled={busy || picker.reading}
              onClick={() => void run(async () => {
                await api("logout", {});
                setUser(null);
                setDraft(null);
                setMessages([]);
                setReport(null);
                setAttachments([]);
                setNotice("Đã đăng xuất tài khoản.");
              })}
            >
              Đăng xuất
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="store-loading">
          <div className="store-loading-dot"/><div className="store-loading-dot"/><div className="store-loading-dot"/>
          <span>Đang kiểm tra phiên đăng nhập…</span>
        </div>
      ) : (
        <>
        <section className="store-welcome" aria-labelledby="store-welcome-title">
          <div><span className="store-eyebrow">MỖI NGÀY MỘT CHÚT THẢNH THƠI</span><h2 id="store-welcome-title">Nắm rõ cửa hàng.<br /><em>Nhẹ nhàng từng ngày.</em></h2><p>Ghi sổ bằng hội thoại, kiểm tra trước khi lưu.<br />Mọi con số ở đây đều bắt đầu từ cửa hàng của bạn.</p></div>
          <div className="store-welcome-orbit" aria-hidden="true"><StoreEmblem /><span>SỔ CỬA HÀNG · TRỢ LÝ AI</span></div>
        </section>
        <nav className="store-overview" aria-label="Lối tắt cửa hàng">
          <a href="#store-chat"><span className="store-tile-index">01 / HỘI THOẠI</span><strong>Trợ lý cửa hàng <span>↗</span></strong><small>{messages.length ? `${messages.length} tin nhắn trong sổ trò chuyện` : "Nhập hàng, ghi bán và hỏi về cửa hàng"}</small></a>
          <a href="#store-draft"><span className="store-tile-index">02 / CHỜ XÁC NHẬN</span><strong>{draft ? "Có phiếu cần kiểm tra" : "Sổ sách đã sẵn sàng"}<span>↗</span></strong><small>{draft ? draft.payload.type === "inventory" ? inventoryLabels[draft.payload.operation] : `${labels[draft.payload.kind]} · ${draft.payload.lines.length} mặt hàng` : "Chỉ ghi sổ khi bạn xác nhận phiếu"}</small></a>
          <a href="#store-reports"><span className="store-tile-index">03 / BÁO CÁO</span><strong>Hiểu những con số <span>↗</span></strong><small>{report ? `${report.query.from} → ${report.query.to}` : "Doanh thu, chi phí và tồn kho thực tế"}</small></a>
        </nav>
        <div className="store-grid">
          <section id="store-chat" className="store-card store-chat">
            <div className="store-section-heading">
              <div><span className="store-eyebrow">CÙNG BẠN GHI SỔ</span><h2>Trợ lý cửa hàng</h2></div>
              <span className="store-live">Bạn duyệt trước khi lưu</span>
            </div>
            <p className="store-muted">Ví dụ: “Hôm nay nhập 30 con gà ủ muối giá 120.000đ/con, 50 hộp giá 3.000đ/hộp”. Ghi rõ đơn giá và đơn vị từng món; bạn có thể bổ sung qua nhiều tin nhắn.</p>
            <div className="store-messages" aria-live="polite">
              {messages.length === 0 && (
                <div className="store-empty store-chat-welcome"><div className="store-assistant-emblem"><StoreEmblem /></div><h3>Hôm nay cửa hàng thế nào?</h3><p>Từ một lần nhập hàng đến bức tranh buôn bán,<br />cứ nhắn cho Gà bằng lời của bạn.</p><div className="store-suggestions">{["Hôm nay nhập 30 con gà ủ muối", "Tình hình buôn bán tháng này thế nào?", "Cửa hàng đang còn những mặt hàng nào?"].map(text => <button type="button" key={text} disabled={busy} onClick={() => { setInput(text); document.getElementById("store-message")?.focus(); }}>{text}<span aria-hidden="true">↗</span></button>)}</div></div>
              )}
              {messages.map((message, i) => (
                <article key={i} className={`store-message ${message.role === "user" ? "is-user" : ""}`}>
                  <strong>{message.role === "user" ? "Bạn" : "Gà"}</strong>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>

            <div id="store-draft" />
            {draft && (
              <section className="store-draft">
                {draft.payload.type === "inventory" ? <InventoryReview payload={draft.payload} /> : <>
                <span className="store-eyebrow">PHIẾU NHÁP · CHƯA GHI SỔ</span>
                <h3>{labels[draft.payload.kind]} · {draft.payload.date}</h3>
                <div className="store-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Mặt hàng</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr>
                    </thead>
                    <tbody>
                      {draft.payload.lines.map((line, i) => (
                        <tr key={i}>
                          <td>{line.name}</td>
                          <td>{line.quantity} {line.unit}</td>
                          <td>{money(line.unitPrice)}</td>
                          <td>{money(Math.round(Math.round(line.quantity * 1000) * line.unitPrice / 1000))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p><strong>Tổng: {money(draft.payload.lines.reduce((s, l) => s + Math.round(Math.round(l.quantity * 1000) * l.unitPrice / 1000), 0))}</strong></p>
                {draft.payload.note && <p>{draft.payload.note}</p>}
                <p className="store-muted">Kiểm tra kỹ tên hàng, ngày, đơn vị và giá. Nhắn tiếp để sửa; phiếu mới sẽ thay phiếu cũ. Phiếu hết hạn sau 24 giờ.</p>
                </>}
                <div className="store-actions">
                  <button className="store-primary" disabled={busy} onClick={() => void run(async () => {
                    const result = await api("confirm", { id: draft.id });
                    setDraft(null);
                    setReport(null);
                    setNotice(`${result.alreadyConfirmed ? "Đề xuất đã được áp dụng trước đó" : draft.payload.type === "inventory" ? "Đã cập nhật kho thành công" : "Đã ghi sổ thành công"}. Mã phiếu: ${result.receiptId}`);
                  })}>
                    {draft.payload.type === "inventory" ? draft.payload.operation === "archive_product" ? "Xác nhận xóa khỏi kho" : "Xác nhận cập nhật kho" : "Xác nhận và ghi sổ"}
                  </button>
                  <button disabled={busy} onClick={() => void run(async () => {
                    await api("cancel", { id: draft.id });
                    setDraft(null);
                    setNotice("Đã hủy phiếu nháp.");
                  })}>
                    Hủy phiếu
                  </button>
                </div>
              </section>
            )}

            <form className={`store-composer ${dragging ? "is-dragging" : ""}`} onSubmit={send}
              onDragOver={event => { event.preventDefault(); if (!busy && !picker.reading) setDragging(true); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
              onDrop={event => { setDragging(false); if (!busy && !picker.reading) picker.onDrop(event); else event.preventDefault(); }}>
              <StoreAttachments files={attachments} disabled={busy} reading={picker.reading} onSelect={files => { void picker.addFiles(files); }} onRemove={index => setAttachments(old => old.filter((_,i) => i !== index))} />
              <label htmlFor="store-message">Nhắn cho trợ lý</label>
              <textarea
                id="store-message"
                value={input}
                onChange={event => setInput(event.target.value)}
                onPaste={event => { if (!busy && !picker.reading) picker.onPaste(event); }}
                placeholder="Nhập hàng hôm nay hoặc hỏi về cửa hàng…"
                maxLength={6000}
                rows={3}
                disabled={busy}
                required={!attachments.length}
              />
              <div className="store-composer-footer"><small>Phiếu nhập và bán luôn cần bạn xác nhận.</small><button className="store-primary" disabled={busy || picker.reading || (!input.trim() && !attachments.length)}>
                {busy ? "Đang xử lý…" : "Gửi tin nhắn"}
                <span aria-hidden="true">↗</span>
              </button></div>
            </form>
          </section>

          <aside id="store-reports" className="store-card store-reports">
            <div className="store-section-heading"><div><span className="store-eyebrow">GÓC NHÌN KINH DOANH</span><h2>Báo cáo cửa hàng</h2></div><span>TỪ SỔ ĐÃ GHI</span></div>
            <p className="store-muted">Chọn khoảng thời gian bạn muốn nhìn lại.</p>
            <form onSubmit={event => {
              event.preventDefault();
              void run(async () => {
                const result = await api("reports", { from, to, bucket, item });
                setReport(result.report);
              });
            }}>
              <div className="store-date-row">
                <label>Từ ngày<input type="date" value={from} onChange={e => setFrom(e.target.value)} required /></label>
                <label>Đến ngày<input type="date" value={to} max={localToday()} onChange={e => setTo(e.target.value)} required /></label>
              </div>
              <label>Gộp theo
                <select value={bucket} onChange={e => setBucket(e.target.value)}>
                  <option value="day">Ngày</option>
                  <option value="month">Tháng</option>
                  <option value="year">Năm</option>
                </select>
              </label>
              <label>Mặt hàng (để trống xem toàn bộ)
                <input value={item} onChange={e => setItem(e.target.value)} maxLength={120} />
              </label>
              <button disabled={busy}>Xem báo cáo</button>
            </form>

            {report ? (
              <>
                <p className="store-muted">{report.query.from} → {report.query.to}{report.query.item && ` · ${report.query.item}`}</p>
                <div className="store-metrics">
                  {[["Doanh thu", report.revenue], ["Tiền nhập hàng", report.purchases], ["Chi phí khác", report.expenses], ["Chênh lệch thu chi", report.cashDifference]].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{money(value)}</strong>
                    </div>
                  ))}
                </div>
                <p className="store-muted">{report.note}</p>
                <details>
                  <summary>Chi tiết theo {report.query.bucket === "day" ? "ngày" : report.query.bucket === "month" ? "tháng" : "năm"}</summary>
                  <div className="store-table-wrap">
                    <table>
                      <thead><tr><th>Kỳ</th><th>Loại</th><th>Số tiền</th></tr></thead>
                      <tbody>
                        {report.series.map((row, i) => (
                          <tr key={i}><td>{row.period}</td><td>{labels[row.kind]}</td><td>{money(row.amount)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <h3>Tồn kho đến {report.query.to}</h3>
                {report.inventory.length ? (
                  <div className="store-table-wrap">
                    <table>
                      <thead><tr><th>Mặt hàng</th><th>Tồn</th></tr></thead>
                      <tbody>
                        {report.inventory.map((row, i) => (
                          <tr key={i}><td>{row.name}</td><td>{Number(row.stock)} {row.unit}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="store-muted">Chưa có dữ liệu tồn kho trong phạm vi này.</p>
                )}
                <details>
                  <summary>Chi tiết mặt hàng</summary>
                  <div className="store-table-wrap">
                    <table>
                      <thead><tr><th>Mặt hàng</th><th>Loại</th><th>Số lượng</th><th>Số tiền</th></tr></thead>
                      <tbody>
                        {report.products.map((row, i) => (
                          <tr key={i}><td>{row.name}</td><td>{labels[row.kind]}</td><td>{Number(row.quantity)} {row.unit}</td><td>{money(row.amount)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                {(report.truncated.inventory || report.truncated.products) && (
                  <p className="store-error">Danh sách đã rút gọn. Lọc tên mặt hàng để xem cụ thể; tổng tiền vẫn tính toàn bộ phạm vi.</p>
                )}
              </>
            ) : (
              <p className="store-empty">Chọn khoảng thời gian để xem dữ liệu thật. Báo cáo không cần gọi AI.</p>
            )}
          </aside>
        </div>
        <footer className="store-footer"><span>GÀ Ủ MUỐI <b> / </b> Sổ cửa hàng của bạn</span><span>Hiểu từng con số · Chủ động từng quyết định</span></footer>
        </>
      )}
    </main>
  );
}
