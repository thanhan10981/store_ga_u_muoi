"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

function textOf(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children);
    return "";
  }).join("");
}

export function CopyButton({ text, label = "Sao chép", compact = false }: { text: string; label?: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); }
    catch { setState("error"); }
    setTimeout(() => setState("idle"), 2000);
  }
  return <button type="button" className={compact ? "icon-button copy-message" : "code-copy"} aria-label={state === "copied" ? "Đã sao chép" : label} title={state === "error" ? "Trình duyệt không cho phép sao chép" : label} onClick={copy}>
    {state === "copied" ? <Check size={14} /> : <Copy size={14} />}
    {!compact && <span>{state === "copied" ? "Đã chép" : state === "error" ? "Không chép được" : label}</span>}
    <span className="sr-only" role="status">{state === "copied" ? "Đã sao chép" : state === "error" ? "Trình duyệt không cho phép sao chép" : ""}</span>
  </button>;
}

export function Markdown({ content }: { content: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    pre({ children }) {
      const child = Children.toArray(children)[0];
      const language = isValidElement<{ className?: string }>(child) ? child.props.className?.replace("language-", "") : "";
      return <div className="code-block"><div className="code-toolbar"><span>{language || "code"}</span><CopyButton text={textOf(children).replace(/\n$/, "")} /></div><pre>{children}</pre></div>;
    },
    table({ children }) { return <div className="table-scroll"><table>{children}</table></div>; },
    a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>; },
    img({ alt }) { return <span className="image-alt">[Hình ảnh{alt ? `: ${alt}` : ""}]</span>; },
  }}>{content}</ReactMarkdown></div>;
}
