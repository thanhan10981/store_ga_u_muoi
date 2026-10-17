"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

export function StoreLogin({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [visible, setVisible] = useState(false);
  return <section className="store-login store-card" aria-labelledby="login-heading">
    <div className="store-login-icon"><LockKeyhole size={24} aria-hidden="true" /></div>
    <span className="store-eyebrow">DÀNH CHO CHỦ CỬA HÀNG</span>
    <h2 id="login-heading">Đăng nhập quản lý</h2>
    <p className="store-muted">Đăng nhập để trò chuyện với trợ lý và xem sổ cửa hàng của bạn.</p>
    <form onSubmit={onSubmit}>
      <fieldset disabled={busy}>
        <label htmlFor="login-username">Tên đăng nhập</label>
        <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={80} placeholder="Tên tài khoản của bạn" />
        <label htmlFor="login-password">Mật khẩu</label>
        <div className="store-password-field">
          <input id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required maxLength={256} />
          <button type="button" aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={visible} aria-controls="login-password" onClick={() => setVisible(value => !value)}>
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
        <label htmlFor="login-otp">Mã Authenticator</label>
        <input id="login-otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="6 chữ số" aria-describedby="login-otp-help" />
        <p id="login-otp-help" className="store-muted">Nhập mã từ ứng dụng Authenticator đã liên kết với tài khoản.</p>
        <button type="submit" className="store-primary store-login-submit">{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      </fieldset>
    </form>
    <p className="store-login-security"><ShieldCheck size={16} aria-hidden="true" /> Dữ liệu cửa hàng chỉ truy cập được sau khi xác thực.</p>
    <p className="store-muted">Chưa có tài khoản hoặc mất Authenticator? Liên hệ người quản trị hệ thống để được cấp lại quyền truy cập.</p>
  </section>;
}
