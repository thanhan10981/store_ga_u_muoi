"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Paperclip, FileText, X, Expand, UploadCloud } from "lucide-react";
import { createPortal } from "react-dom";

export type ChatAttachment = { name: string; data: string };
const mimeFor = (name: string) => /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : /\.jpe?g$/i.test(name) ? "image/jpeg" : null;
const sizeOf = (file: ChatAttachment) => Math.floor(file.data.length * 3 / 4) - (file.data.endsWith("==") ? 2 : file.data.endsWith("=") ? 1 : 0);

export function useAttachmentPicker(files: ChatAttachment[], onChange: (files: ChatAttachment[]) => void, onError: (message: string) => void) {
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  async function addFiles(incoming: File[]) {
    if (!incoming.length || readingRef.current) return;
    if (files.length + incoming.length > 3) { onError("Mỗi tin nhắn tối đa 3 tệp."); return; }
    if (incoming.some(file => !/\.(png|jpe?g|webp|pdf|xlsx|docx|csv|txt)$/i.test(file.name))) { onError("Hỗ trợ PNG, JPG, WEBP, PDF, XLSX, DOCX, CSV, TXT."); return; }
    if (incoming.some(file => !file.size || file.size > 2 * 1024 * 1024)) { onError("Mỗi tệp phải có nội dung và tối đa 2 MB."); return; }
    if (files.reduce((n,file) => n + sizeOf(file), 0) + incoming.reduce((n,file) => n + file.size, 0) > 2800000) { onError("Tổng tệp tối đa 2,8 MB mỗi tin nhắn. Hãy gửi từng tệp riêng."); return; }
    readingRef.current = true; setReading(true);
    try {
      const loaded = await Promise.all(incoming.map(file => new Promise<ChatAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Không đọc được tệp trên thiết bị."));
        reader.onload = () => resolve({ name: file.name.replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0,160), data: String(reader.result).split(",")[1] });
        reader.readAsDataURL(file);
      })));
      onChange([...files, ...loaded]);
    } catch { onError("Không đọc được tệp. Hãy chọn lại."); }
    finally { readingRef.current = false; setReading(false); }
  }
  function onPaste(event: ClipboardEvent) {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length) { event.preventDefault(); void addFiles(pasted); }
  }
  function onDrop(event: DragEvent) {
    event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files));
  }
  return { reading, addFiles, onPaste, onDrop };
}

export function StoreAttachments({ files, onRemove, onSelect, disabled, reading }: {
  files: ChatAttachment[]; onRemove: (index: number) => void; onSelect: (files: File[]) => void; disabled: boolean; reading: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [preview]);
  return <>
    <div className="store-upload-toolbar">
      <input ref={input} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.docx,.csv,.txt" hidden aria-label="Chọn ảnh hoặc tài liệu" disabled={disabled || reading} onChange={event => { onSelect(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <button type="button" disabled={disabled || reading || files.length >= 3} onClick={() => input.current?.click()}><Paperclip size={15} />{reading ? "Đang đọc tệp…" : "Đính kèm"}</button>
      <small><UploadCloud size={13} aria-hidden="true" /> Kéo thả hoặc dán ảnh · tối đa 3 tệp</small>
    </div>
    {files.length > 0 && <ul className="store-attachments" aria-label="Tệp chờ gửi">{files.map((file,index) => {
      const mime = mimeFor(file.name);
      return <li key={`${index}-${file.name}`}>
        {mime ? <button type="button" className="store-attachment-thumb" aria-label={`Xem ảnh ${file.name}`} onClick={() => setPreview(file)}>
          {/* Local data URL, never a user-supplied remote resource. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:${mime};base64,${file.data}`} alt={file.name} /><Expand size={12} />
        </button> : <span className="store-attachment-file"><FileText size={23} /></span>}
        <div><strong title={file.name}>{file.name}</strong><small>{Math.ceil(sizeOf(file) / 1024)} KB · {mime ? "Ảnh" : "Tài liệu"}</small></div>
        <button type="button" className="store-attachment-remove" aria-label={`Xóa tệp ${file.name}`} disabled={disabled || reading} onClick={() => onRemove(index)}><X size={14} /></button>
      </li>;
    })}</ul>}
    <p className="store-upload-hint">Ảnh, PDF có chữ, Excel, Word, CSV, TXT · 2 MB/tệp, tổng 2,8 MB. Tệp gửi cho AI và không lưu bản gốc; gửi lại nếu cần đọc ở lượt sau.</p>
    {preview && createPortal(<div className="store-image-overlay" role="dialog" aria-modal="true" aria-label={`Xem trước ${preview.name}`} onClick={() => setPreview(null)}><div className="store-image-dialog" onClick={event => event.stopPropagation()}><header><strong>{preview.name}</strong><button ref={closeButton} type="button" aria-label="Đóng xem trước" onClick={() => setPreview(null)}><X size={20} /></button></header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:${mimeFor(preview.name)};base64,${preview.data}`} alt={preview.name} />
    </div></div>, document.body)}
  </>;
}
