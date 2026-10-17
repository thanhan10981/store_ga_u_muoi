"use client";

import { useEffect, useState, type FormEvent } from "react";
import { StoreLogin } from "./store-login";
import "./store.css";

type Line = { name: string; unit: string; quantity: number; unitPrice: number };
type Draft = { id: string; payload: { kind: string; date: string; note: string; lines: Line[] } };
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

export function StoreApp() {
  const [user, setUser] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [input, setInput] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bucket, setBucket] = useState("day");
  const [item, setItem] = useState("");

  useEffect(() => {
    fetch("/api/store/session", { cache: "no-store" }).then(async response => {
      const today = localToday(); setTo(today); setFrom(`${today.slice(0, 7)}-01`);
      const data = await response.json();
      if (response.ok) { setUser(data); setDraft(data.draft); setMessages(data.messages ?? []); }
      else if (response.status !== 401) setError(data.error ?? "Không kết nối được backend.");
    }).catch(() => setError("Không kết nối được backend.")).finally(() => setLoading(false));
  }, []);

  async function api(path: string, body: unknown) {
    const response = await fetch(`/api/store/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": user?.csrf ?? "" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.status === 401) { setUser(null); setMessages([]); setDraft(null); setReport(null); }
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Yêu cầu không thành công.");
    return data;
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Có lỗi kết nối. Hãy tải lại để kiểm tra phiếu."); }
    finally { setBusy(false); }
  }
  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      await api("login", { username: data.get("username"), password: data.get("password"), otp: data.get("otp") });
      // Re-fetch authoritative pending draft after login (including another device's draft).
      const response = await fetch("/api/store/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Chưa xác minh được phiên đăng nhập. Hãy tải lại trang rồi thử lại.");
      const state = await response.json();
      setUser(state); setDraft(state.draft); setMessages(state.messages ?? []);
    });
  }
  function send(event: FormEvent) {
    event.preventDefault(); if (!input.trim()) return;
    const message = input.trim();
    void run(async () => {
      const result = await api("chat", { message });
      setMessages(old => [...old, { role: "user", content: message }, { role: "assistant", content: result.answer }]);
      setInput("");
      if (result.draft) setDraft(result.draft);
      if (result.report) setReport(result.report);
    });
  }

  return <main className="store-shell">
    <header className="store-header"><div><span className="store-eyebrow">MẠCH · SỔ CỬA HÀNG</span><h1>Gà ủ muối</h1><p>Nhập hàng, theo dõi buôn bán, hiểu cửa hàng qua hội thoại.</p></div>
      {user && <div className="store-account"><span>{user.username}</span><button disabled={busy} onClick={() => void run(async () => { await api("logout", {}); setUser(null); setDraft(null); setMessages([]); setReport(null); })}>Đăng xuất</button></div>}
    </header>
    {error && <div className="store-error" role="alert">{error}</div>}
    {notice && <div className="store-notice" role="status">{notice}</div>}
    {loading ? <p>Đang kiểm tra phiên đăng nhập…</p> : !user ? <StoreLogin busy={busy} onSubmit={login} /> : <div className="store-grid">
      <section className="store-card store-chat"><div className="store-section-heading"><h2>Trợ lý cửa hàng</h2><span>Cần xác nhận trước khi ghi sổ</span></div>
        <p className="store-muted">Ví dụ: “Hôm nay nhập 30 con gà ủ muối giá 120.000đ/con, 50 hộp giá 3.000đ/hộp”. Ghi rõ đơn giá và đơn vị từng món; bạn có thể bổ sung qua nhiều tin nhắn.</p>
        <div className="store-messages" aria-live="polite">{messages.length === 0 && <div className="store-empty">Bắt đầu bằng một phiếu nhập, phiếu bán hoặc câu hỏi “Tình hình buôn bán tháng này và cần nhập thêm gì?”</div>}{messages.map((message, i) => <article key={i} className={`store-message ${message.role === "user" ? "is-user" : ""}`}><strong>{message.role === "user" ? "Bạn" : "Mạch"}</strong><p>{message.content}</p></article>)}</div>
        {draft && <section className="store-draft"><span className="store-eyebrow">PHIẾU NHÁP · CHƯA GHI SỔ</span><h3>{labels[draft.payload.kind]} · {draft.payload.date}</h3><div className="store-table-wrap"><table><thead><tr><th>Mặt hàng</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{draft.payload.lines.map((line, i) => <tr key={i}><td>{line.name}</td><td>{line.quantity} {line.unit}</td><td>{money(line.unitPrice)}</td><td>{money(Math.round(Math.round(line.quantity * 1000) * line.unitPrice / 1000))}</td></tr>)}</tbody></table></div><p><strong>Tổng: {money(draft.payload.lines.reduce((s, l) => s + Math.round(Math.round(l.quantity * 1000) * l.unitPrice / 1000), 0))}</strong></p>{draft.payload.note && <p>{draft.payload.note}</p>}<p className="store-muted">Kiểm tra kỹ tên hàng, ngày, đơn vị và giá. Nhắn tiếp để sửa; phiếu mới sẽ thay phiếu cũ. Phiếu hết hạn sau 24 giờ.</p><div className="store-actions"><button className="store-primary" disabled={busy} onClick={() => void run(async () => { const result = await api("confirm", { id: draft.id }); setDraft(null); setReport(null); setNotice(`${result.alreadyConfirmed ? "Phiếu đã được ghi trước đó" : "Đã ghi sổ thành công"}. Mã phiếu: ${result.receiptId}`); })}>Xác nhận và ghi sổ</button><button disabled={busy} onClick={() => void run(async () => { await api("cancel", { id: draft.id }); setDraft(null); setNotice("Đã hủy phiếu nháp."); })}>Hủy phiếu</button></div></section>}
        <form className="store-composer" onSubmit={send}><label htmlFor="store-message">Nhắn cho trợ lý</label><textarea id="store-message" value={input} onChange={event => setInput(event.target.value)} placeholder="Nhập hàng hôm nay hoặc hỏi về cửa hàng…" maxLength={6000} rows={3} disabled={busy} required /><button className="store-primary" disabled={busy || !input.trim()}>{busy ? "Đang xử lý…" : "Gửi tin nhắn"}</button></form>
      </section>
      <aside className="store-card store-reports"><h2>Báo cáo từ sổ cửa hàng</h2><form onSubmit={event => { event.preventDefault(); void run(async () => { const result = await api("reports", { from, to, bucket, item }); setReport(result.report); }); }}><div className="store-date-row"><label>Từ ngày<input type="date" value={from} onChange={e => setFrom(e.target.value)} required /></label><label>Đến ngày<input type="date" value={to} max={localToday()} onChange={e => setTo(e.target.value)} required /></label></div><label>Gộp theo<select value={bucket} onChange={e => setBucket(e.target.value)}><option value="day">Ngày</option><option value="month">Tháng</option><option value="year">Năm</option></select></label><label>Mặt hàng (để trống xem toàn bộ)<input value={item} onChange={e => setItem(e.target.value)} maxLength={120} /></label><button disabled={busy}>Xem báo cáo</button></form>
        {report ? <><p className="store-muted">{report.query.from} → {report.query.to}{report.query.item && ` · ${report.query.item}`}</p><div className="store-metrics">{[["Doanh thu", report.revenue], ["Tiền nhập hàng", report.purchases], ["Chi phí khác", report.expenses], ["Chênh lệch thu chi", report.cashDifference]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div><p className="store-muted">{report.note}</p><details><summary>Chi tiết theo {report.query.bucket === "day" ? "ngày" : report.query.bucket === "month" ? "tháng" : "năm"}</summary><div className="store-table-wrap"><table><thead><tr><th>Kỳ</th><th>Loại</th><th>Số tiền</th></tr></thead><tbody>{report.series.map((row, i) => <tr key={i}><td>{row.period}</td><td>{labels[row.kind]}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div></details><h3>Tồn kho đến {report.query.to}</h3>{report.inventory.length ? <div className="store-table-wrap"><table><thead><tr><th>Mặt hàng</th><th>Tồn</th></tr></thead><tbody>{report.inventory.map((row, i) => <tr key={i}><td>{row.name}</td><td>{Number(row.stock)} {row.unit}</td></tr>)}</tbody></table></div> : <p className="store-muted">Chưa có dữ liệu tồn kho trong phạm vi này.</p>}<details><summary>Chi tiết mặt hàng</summary><div className="store-table-wrap"><table><thead><tr><th>Mặt hàng</th><th>Loại</th><th>Số lượng</th><th>Số tiền</th></tr></thead><tbody>{report.products.map((row, i) => <tr key={i}><td>{row.name}</td><td>{labels[row.kind]}</td><td>{Number(row.quantity)} {row.unit}</td><td>{money(row.amount)}</td></tr>)}</tbody></table></div></details>{(report.truncated.inventory || report.truncated.products) && <p className="store-error">Danh sách đã rút gọn. Lọc tên mặt hàng để xem cụ thể; tổng tiền vẫn tính toàn bộ phạm vi.</p>}</> : <p className="store-empty">Chọn khoảng thời gian để xem dữ liệu thật. Báo cáo không cần gọi AI.</p>}
      </aside>
    </div>}
  </main>;
}
