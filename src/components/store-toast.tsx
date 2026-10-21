"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastItem = {
  id: string;
  type: "error" | "notice" | "info";
  title?: string;
  message: string;
  duration?: number;
};

interface StoreToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function StoreToastStack({ toasts, onDismiss }: StoreToastStackProps) {
  if (!toasts.length) return null;

  return (
    <aside className="store-toast-container" aria-live="assertive" aria-label="Thông báo hệ thống">
      {toasts.map((toast) => (
        <ToastSingle key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </aside>
  );
}

function ToastSingle({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [isClosing, setIsClosing] = useState(false);
  const duration = toast.duration ?? 5000;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      handleClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => {
      onDismiss();
    }, 280); // wait for exit animation
  }

  const defaultTitles = {
    error: "Có lỗi xảy ra",
    notice: "Thông báo thành công",
    info: "Thông tin",
  };

  return (
    <div
      className={`store-toast-item is-${toast.type} ${isClosing ? "is-leaving" : ""}`}
      role={toast.type === "error" ? "alert" : "status"}
    >
      <div className="store-toast-icon-wrap" aria-hidden="true">
        {toast.type === "error" && <AlertTriangle size={18} strokeWidth={2.4} />}
        {toast.type === "notice" && <CheckCircle2 size={18} strokeWidth={2.4} />}
        {toast.type === "info" && <Info size={18} strokeWidth={2.4} />}
      </div>

      <div className="store-toast-body">
        <h4 className="store-toast-title">{toast.title || defaultTitles[toast.type]}</h4>
        <p className="store-toast-msg">{toast.message}</p>
      </div>

      <button
        type="button"
        className="store-toast-close"
        onClick={handleClose}
        aria-label="Đóng thông báo"
      >
        <X size={15} />
      </button>

      {duration > 0 && (
        <div
          className="store-toast-progress"
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
}
