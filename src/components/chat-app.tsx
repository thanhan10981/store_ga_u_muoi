"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, Code2, Feather, Lightbulb, Menu, MessageSquare, Monitor, Moon, Pencil, Plus, RotateCcw, Search, ShieldCheck, Square, Sun, Trash2, X } from "lucide-react";
import { Brand } from "./brand";
import { CopyButton, Markdown } from "./markdown";
import { MAX_MESSAGE_CHARS, type ChatError } from "@/lib/limits";
import { MAX_CONVERSATIONS, MAX_STORED_MESSAGES, STORAGE_KEY, newConversation, parseWorkspace, requestHistory, type Conversation, type Message, type Workspace } from "@/lib/conversations";
import { ChatRequestError, streamReply } from "@/lib/chat-client";
import { CHAT_MODELS, isChatModel, type ChatModel } from "@/lib/models";
import type { AIProvider } from "@/lib/providers";

const prompts = [
  { icon: Feather, label: "Viết hay hơn", caption: "Tìm đúng lời cho ý tưởng của bạn", prompt: "Giúp tôi viết một email giới thiệu bản thân thật tự nhiên và chuyên nghiệp. Hãy hỏi tôi những thông tin bạn cần trước." },
  { icon: Lightbulb, label: "Khơi mở ý tưởng", caption: "Một góc nhìn mới cho điều quen thuộc", prompt: "Cùng tôi nghĩ ra 5 ý tưởng cho một dự án cá nhân cuối tuần. Trước tiên, hãy hỏi về sở thích của tôi." },
  { icon: Code2, label: "Cùng lập trình", caption: "Từ dòng code đến lời giải rõ ràng", prompt: "Giải thích async/await trong JavaScript bằng ví dụ dễ hiểu, kèm đoạn code và những lỗi thường gặp." },
  { icon: BookOpen, label: "Học điều mới", caption: "Biến điều phức tạp thành dễ hiểu", prompt: "Hãy giúp tôi tìm hiểu một chủ đề mới theo từng bước. Bắt đầu bằng việc hỏi tôi muốn học gì và đã biết đến đâu." },
];

type Dialog = { type: "rename" | "delete"; id: string; title: string } | null;
const initialWorkspace: Workspace = { version: 1, activeId: null, conversations: [] };
const EMPTY_MESSAGES: Message[] = [];

export function ChatApp({ configured, model, provider }: { configured: boolean; model: ChatModel; provider: AIProvider }) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [selectedModel, setSelectedModel] = useState<ChatModel>(model);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const workspaceRef = useRef(workspace);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const canPersist = useRef(true);
  const sendingRef = useRef(false);
  const atBottom = useRef(true);
  const active = workspace.conversations.find((c) => c.id === workspace.activeId);
  const messages = active?.messages ?? EMPTY_MESSAGES;

  useEffect(() => {
    const raw = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { canPersist.current = false; return null; } })();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { if (raw) setWorkspace(parseWorkspace(raw)); }
      catch { canPersist.current = false; setStorageWarning("Không đọc được lịch sử đã lưu. Dữ liệu cũ được giữ nguyên; phiên hiện tại chỉ lưu trong bộ nhớ."); }
      if (!canPersist.current && !raw) setStorageWarning("Trình duyệt không cho phép lưu dữ liệu. Lịch sử phiên này sẽ mất khi tải lại trang.");
      setTheme(document.documentElement.dataset.theme || "light");
      try {
        const savedModel = localStorage.getItem("mach-model");
        if (isChatModel(savedModel)) setSelectedModel(savedModel);
      } catch { /* The server default still works when storage is blocked. */ }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    workspaceRef.current = workspace;
    if (!loaded || !canPersist.current) return;
    // Persist partial answers as well, so reloads cannot lose a running turn.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); }
    catch { queueMicrotask(() => setStorageWarning("Bộ nhớ trình duyệt đã đầy hoặc bị chặn. Tin nhắn mới chỉ được giữ trong phiên này; hãy xóa bớt hội thoại.")); }
  }, [workspace, loaded]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) { textarea.style.height = "auto"; textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`; }
  }, [input]);

  useEffect(() => {
    if (atBottom.current) {
      const scroller = scrollerRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (dialog) { dialogRef.current?.showModal(); }
    else dialogRef.current?.close();
  }, [dialog]);
  useEffect(() => {
    if (settingsOpen) settingsRef.current?.showModal();
    else settingsRef.current?.close();
  }, [settingsOpen]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    const media = matchMedia("(min-width: 641px)");
    const closeDrawer = () => { if (media.matches) setSidebarOpen(false); };
    media.addEventListener("change", closeDrawer);
    return () => media.removeEventListener("change", closeDrawer);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const first = sidebarRef.current?.querySelector<HTMLButtonElement>("button");
    first?.focus();
    function trap(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") { setSidebarOpen(false); menuRef.current?.focus(); }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]'));
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [sidebarOpen]);

  function updateConversation(id: string, change: (c: Conversation) => Conversation) {
    setWorkspace((state) => ({ ...state, conversations: state.conversations.map((c) => c.id === id ? change(c) : c) }));
  }
  function updateMessage(conversationId: string, messageId: string, change: (m: Message) => Message) {
    updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.map((m) => m.id === messageId ? change(m) : m) }));
  }
  function stop() { controllerRef.current?.abort(); }
  function selectConversation(id: string) {
    if (sendingRef.current) return;
    setWorkspace((s) => ({ ...s, activeId: id }));
    setSidebarOpen(false); setInput(""); atBottom.current = true; setNearBottom(true);
  }
  function createConversation() {
    if (sendingRef.current) return;
    const existing = workspace.conversations.find((c) => c.messages.length === 0);
    if (existing) { selectConversation(existing.id); return; }
    const conversation = newConversation();
    setWorkspace((s) => ({ ...s, activeId: conversation.id, conversations: [conversation, ...s.conversations].slice(0, MAX_CONVERSATIONS) }));
    setSidebarOpen(false); setSearch(""); setInput(""); atBottom.current = true; setNearBottom(true);
    inputRef.current?.focus();
  }

  async function send(text: string, retryIndex?: number) {
    if (!loaded || sendingRef.current || !text.trim() || text.length > MAX_MESSAGE_CHARS) return;
    sendingRef.current = true; setBusy(true);
    atBottom.current = true; setNearBottom(true);
    let conversation = workspaceRef.current.conversations.find((c) => c.id === workspaceRef.current.activeId);
    if (!conversation) conversation = newConversation();
    const id = conversation.id;
    const base = retryIndex !== undefined ? conversation.messages.slice(0, retryIndex) : [...conversation.messages, { id: crypto.randomUUID(), role: "user" as const, content: text.trim(), status: "complete" as const }];
    const replyId = crypto.randomUUID();
    const reply: Message = { id: replyId, role: "assistant", content: "", status: "streaming" };
    const updated: Conversation = {
      ...conversation,
      title: conversation.messages.length || conversation.title !== "Cuộc trò chuyện mới" ? conversation.title : text.trim().replace(/\s+/g, " ").slice(0, 55),
      // eslint-disable-next-line react-hooks/purity -- send runs only from user event handlers.
      updatedAt: Date.now(), messages: [...base, reply].slice(-MAX_STORED_MESSAGES),
    };
    setWorkspace((s) => ({ ...s, activeId: id, conversations: [updated, ...s.conversations.filter((c) => c.id !== id)].slice(0, MAX_CONVERSATIONS) }));
    setInput(""); setSidebarOpen(false);
    const controller = new AbortController();
    controllerRef.current = controller;
    // A browser-side deadline also covers failures between the browser and server.
    let clientTimeout = false;
    const timeout = setTimeout(() => { clientTimeout = true; controller.abort(); }, 70_000);
    try {
      await streamReply(requestHistory(base), controller.signal, (chunk) => {
        updateMessage(id, replyId, (m) => ({ ...m, content: m.content + chunk }));
      }, selectedModel);
      updateMessage(id, replyId, (m) => ({ ...m, status: "complete" }));
    } catch (error) {
      if (controller.signal.aborted && !clientTimeout) updateMessage(id, replyId, (m) => ({ ...m, status: "stopped" }));
      else {
        const detail: ChatError = clientTimeout
          ? { code: "TIMEOUT", message: "Kết nối quá thời gian chờ. Hãy kiểm tra server và thử lại." }
          : error instanceof ChatRequestError ? error.detail : { code: "UNKNOWN", message: "Có lỗi xảy ra. Vui lòng thử lại." };
        updateMessage(id, replyId, (m) => ({ ...m, status: "error", error: detail }));
      }
    } finally {
      clearTimeout(timeout); sendingRef.current = false; controllerRef.current = null; setBusy(false);
      inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) void send(input); }
  }
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next;
    try { localStorage.setItem("mach-theme", next); } catch { /* Theme still works in memory. */ }
  }
  function selectModel(value: string) {
    if (!isChatModel(value) || sendingRef.current) return;
    setSelectedModel(value);
    try { localStorage.setItem("mach-model", value); } catch { /* Selection still works in memory. */ }
  }
  function openDialog(type: "rename" | "delete", c: Conversation) { setDialog({ type, id: c.id, title: c.title }); setRenameValue(c.title); }
  function confirmDialog(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.type === "rename" && renameValue.trim()) updateConversation(dialog.id, (c) => ({ ...c, title: renameValue.trim().slice(0, 80) }));
    else if (dialog.type === "delete") setWorkspace((s) => {
      const conversations = s.conversations.filter((c) => c.id !== dialog.id);
      return { ...s, conversations, activeId: s.activeId === dialog.id ? conversations[0]?.id ?? null : s.activeId };
    });
    setDialog(null);
  }
  const filtered = workspace.conversations.filter((c) => c.title.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Đóng danh sách hội thoại" onClick={() => setSidebarOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Danh sách cuộc trò chuyện" role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen || undefined}>
      <div className="sidebar-brand"><div className="brand-lockup"><span className="brand-icon"><Brand /></span><span>Mạch<span className="brand-dot">.</span></span></div><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Đóng menu"><X size={20} /></button><span className="brand-tag">KHÔNG GIAN AI</span></div>
      <button className="new-chat" onClick={createConversation} disabled={busy || !loaded}><Plus size={18} /><span>Cuộc trò chuyện mới</span></button>
      <label className="search-box"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm cuộc trò chuyện" aria-label="Tìm cuộc trò chuyện" /><kbd>⌕</kbd></label>
      <div className="history-heading"><span>CUỘC TRÒ CHUYỆN</span><span>{workspace.conversations.length.toString().padStart(2, "0")}</span></div>
      <nav className="conversation-list" aria-label="Lịch sử">
        {filtered.length === 0 ? <div className="history-empty"><MessageSquare size={23} strokeWidth={1.3} /><p>{search ? "Chưa tìm thấy hội thoại" : "Một khởi đầu mới"}</p><span>{search ? "Thử một từ khóa khác nhé." : "Những cuộc trò chuyện của bạn sẽ xuất hiện ở đây."}</span></div> : filtered.map((c) => <div key={c.id} className={`conversation-row ${active?.id === c.id ? "selected" : ""}`}>
          <button className="conversation-select" disabled={busy} onClick={() => selectConversation(c.id)} aria-current={active?.id === c.id ? "page" : undefined}><MessageSquare size={15} /><span>{c.title}</span></button>
          <div className="conversation-actions"><button className="icon-button" disabled={busy} aria-label={`Đổi tên ${c.title}`} onClick={() => openDialog("rename", c)}><Pencil size={13} /></button><button className="icon-button" disabled={busy} aria-label={`Xóa ${c.title}`} onClick={() => openDialog("delete", c)}><Trash2 size={13} /></button></div>
        </div>)}
      </nav>
      <div className="sidebar-bottom"><div className="local-note"><span className="note-icon"><Monitor size={17} /></span><div><strong>Không gian của riêng bạn</strong><p>Lưu trên thiết bị này.<br />Chưa đồng bộ giữa các thiết bị.</p></div></div>
        <div className="sidebar-footer"><button className="profile-button" onClick={() => setSettingsOpen(true)}><span className="profile-avatar">B</span><span><strong>Bạn</strong><small>Không gian cá nhân</small></span><ChevronDown size={14} /></button><button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button></div>
      </div>
    </aside>

    <main className="main-panel" inert={sidebarOpen || undefined}>
      <header className="topbar"><div className="topbar-left"><button ref={menuRef} className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Mở danh sách hội thoại" aria-expanded={sidebarOpen}><Menu size={22} /></button><span className="topbar-title">{messages.length ? active?.title : "Một cuộc trò chuyện, nhiều khả năng"}</span><span className="topbar-divider" /><label className="model-picker"><span className="sr-only">Chọn model AI</span><select value={selectedModel} onChange={(e) => selectModel(e.target.value)} disabled={busy || !loaded} title="Model áp dụng cho câu trả lời tiếp theo">{CHAT_MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={13} aria-hidden="true" /></label></div><button className={`connection-pill ${configured ? "configured" : ""}`} onClick={() => setSettingsOpen(true)}><span className="status-dot" />{provider === "chatmock" ? "ChatMock local" : configured ? "Đã cấu hình API" : "Chờ cấu hình API"}<ChevronDown size={12} /></button></header>
      {storageWarning && <div className="storage-warning" role="alert">{storageWarning}<button className="icon-button" onClick={() => setStorageWarning("")} aria-label="Ẩn thông báo"><X size={15} /></button></div>}
      <div className="chat-scroller" ref={scrollerRef} onScroll={() => { const el = scrollerRef.current; if (el) { atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; setNearBottom(atBottom.current); } }}>
        {messages.length === 0 ? <div className="welcome">
          <div className="welcome-emblem"><Brand /><span className="emblem-dot" /></div>
          <p className="eyebrow">KẾT NỐI Ý TƯỞNG. MỞ LỐI MỖI NGÀY.</p>
          <h1>Bạn đang nghĩ gì?<br /><span>Cùng Mạch khám phá.</span></h1>
          <p className="welcome-description">Một người bạn để viết, học hỏi và gỡ rối.<br className="desktop-break" /> Bắt đầu từ bất cứ điều gì bạn tò mò.</p>
          <div className="suggestions">{prompts.map(({ icon: Icon, label, caption, prompt }, i) => <button key={label} className={`suggestion suggestion-${i}`} onClick={() => { setInput(prompt); inputRef.current?.focus(); }} disabled={!loaded}>
            <span className="suggestion-top"><span className="suggestion-icon"><Icon size={20} strokeWidth={1.6} /></span><ArrowRight size={16} className="suggestion-arrow" /></span><strong>{label}</strong><span className="suggestion-caption">{caption}</span>
          </button>)}</div>
          <div className="welcome-footnote"><span />Ý tưởng lớn thường bắt đầu từ một câu hỏi nhỏ.</div>
        </div> : <div className="messages" aria-label="Nội dung cuộc trò chuyện" aria-busy={busy}>
          <div className="chat-date"><span />{new Date(active?.createdAt ?? 0).toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" })}<span /></div>
          {messages.map((message, index) => <article key={message.id} className={`message message-${message.role}`} aria-label={message.role === "user" ? "Tin nhắn của bạn" : "Phản hồi của Mạch"}>
            {message.role === "assistant" && <div className="assistant-avatar"><Brand /></div>}
            <div className="message-content"><div className="message-author">{message.role === "user" ? "Bạn" : "Mạch"}{message.role === "assistant" && <span>AI</span>}</div>
              {message.role === "user" ? <div className="user-bubble">{message.content}</div> : <>
                {message.content && <Markdown content={message.content} />}
                {message.status === "streaming" && <div className="typing" role="status"><span /><span /><span /><small>{message.content ? "Đang viết tiếp" : "Mạch đang suy nghĩ"}</small></div>}
                {message.status === "stopped" && <p className="stopped-label">Đã dừng tạo câu trả lời.</p>}
                {message.status === "error" && <div className="error-card" role="alert"><strong>{message.error?.code === "MISSING_API_KEY" ? "Thêm API key để bắt đầu" : "Chưa thể hoàn tất câu trả lời"}</strong><p>{message.error?.message}</p></div>}
                {message.status !== "streaming" && <div className="message-tools">{message.content && <CopyButton text={message.content} compact label="Sao chép câu trả lời" />}{index === messages.length - 1 && <button className="retry-button" disabled={busy} onClick={() => void send(messages[index - 1]?.content || "", index)}><RotateCcw size={13} />{message.status === "complete" ? "Tạo lại" : "Thử lại"}</button>}</div>}
              </>}
            </div>
          </article>)}
        </div>}
      </div>

      <div className="composer-area">
        {!nearBottom && <button className="scroll-bottom" onClick={() => { const el = scrollerRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); atBottom.current = true; setNearBottom(true); }} aria-label="Cuộn đến tin nhắn mới nhất"><ArrowDown size={17} />Tin nhắn mới nhất</button>}
        <div className="composer-wrap"><form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="chat-input">Tin nhắn cho Mạch</label><textarea id="chat-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={keyDown} placeholder="Hỏi Mạch bất cứ điều gì…" maxLength={MAX_MESSAGE_CHARS} rows={1} disabled={!loaded} />
          <div className="composer-bottom"><span className="composer-hint"><span className="hint-spark">✳</span><span>{busy ? "Một chút nữa, ý tưởng đang thành hình…" : "Cứ tự nhiên, bắt đầu bằng một câu hỏi."}</span></span><div className="composer-controls">{input.length > 5000 && <span className="char-count">{input.length}/6000</span>}{busy ? <button type="button" className="send-button stop-button" onClick={stop} aria-label="Dừng tạo câu trả lời"><Square size={15} fill="currentColor" /></button> : <button className="send-button" type="submit" disabled={!loaded || !input.trim()} aria-label="Gửi tin nhắn"><ArrowUp size={20} /></button>}</div></div>
        </form><div className="composer-footer"><span>Mạch có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.</span><span className="keyboard-hint"><kbd>Enter</kbd> để gửi · <kbd>Shift + Enter</kbd> xuống dòng</span></div></div>
      </div>
      <div className="screen-reader-status" role="status" aria-live="polite">{busy ? "Mạch đang tạo câu trả lời" : messages.length ? "Đã kết thúc phản hồi" : "Sẵn sàng trò chuyện"}</div>
    </main>

    <dialog ref={dialogRef} className="modal" onCancel={() => setDialog(null)} onClick={(e) => { if (e.target === e.currentTarget) setDialog(null); }}><form onSubmit={confirmDialog}>
      <div className="modal-heading"><h2>{dialog?.type === "rename" ? "Đổi tên cuộc trò chuyện" : "Xóa cuộc trò chuyện?"}</h2><button className="icon-button" type="button" aria-label="Đóng hộp thoại" onClick={() => setDialog(null)}><X size={19} /></button></div>
      {dialog?.type === "rename" ? <><label className="field-label" htmlFor="rename">Tên cuộc trò chuyện</label><input id="rename" autoFocus className="rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={80} required /></> : <p className="modal-description">“{dialog?.title}” sẽ bị xóa khỏi thiết bị này. Bạn không thể khôi phục sau khi xóa.</p>}
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setDialog(null)}>Hủy</button><button className={dialog?.type === "delete" ? "button-danger" : "button-primary"} disabled={dialog?.type === "rename" && !renameValue.trim()}>{dialog?.type === "rename" ? <><Check size={16} />Lưu tên</> : <><Trash2 size={16} />Xóa cuộc trò chuyện</>}</button></div>
    </form></dialog>
    <dialog ref={settingsRef} className="modal settings-modal" onCancel={() => setSettingsOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
      <div className="modal-heading"><h2>Không gian của bạn</h2><button className="icon-button" aria-label="Đóng thông tin" onClick={() => setSettingsOpen(false)}><X size={19} /></button></div>
      <div className="settings-section"><ShieldCheck size={22} /><div><h3>{provider === "chatmock" ? "Kết nối qua ChatMock local" : configured ? "API key đã được cấu hình" : "Cần cấu hình API key"}</h3><p>{provider === "chatmock" ? "Mạch gửi yêu cầu tới ChatMock trên máy này. ChatMock dùng phiên đăng nhập ChatGPT riêng để tạo câu trả lời. Nếu báo chưa đăng nhập, chạy python ChatMock-main/chatmock.py login. Không dán token vào cuộc trò chuyện. Nhãn kết nối cho biết nguồn đã chọn, không xác nhận phiên đăng nhập còn hiệu lực." : configured ? "Key chỉ được đọc trên server. Trạng thái này chưa xác minh quyền truy cập hoặc số dư OpenAI." : "Thêm key trực tiếp vào file .env.local tại thư mục dự án rồi khởi động lại server. Không dán key vào cuộc trò chuyện."}</p><code>AI_PROVIDER={provider}<br />{provider === "openai" && <>OPENAI_API_KEY=…<br /></>}OPENAI_MODEL={model}</code></div></div>
      <div className="settings-section"><Monitor size={22} /><div><h3>Lịch sử trên thiết bị này</h3><p>Hội thoại được lưu trong trình duyệt hiện tại, chưa đồng bộ giữa các thiết bị. Tối đa 50 hội thoại, 200 tin mỗi hội thoại; mục cũ nhất sẽ được loại bỏ khi vượt giới hạn. Xóa dữ liệu trình duyệt sẽ xóa lịch sử.</p><p>Khi gửi tin nhắn, nội dung cùng một phần lịch sử gần nhất được gửi tới OpenAI để tạo câu trả lời.</p></div></div>
      <button className="button-primary settings-done" onClick={() => setSettingsOpen(false)}>Đã hiểu<Check size={16} /></button>
    </dialog>
  </div>;
}
