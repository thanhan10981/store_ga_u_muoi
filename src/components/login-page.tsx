"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, Fingerprint, AlertTriangle, ChevronRight } from "lucide-react";
import "./login-page.css";


export function LoginPage() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleCredentials(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStep("otp");
  }

  async function handleOtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/store/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, otp }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Tên đăng nhập hoặc mật khẩu không đúng.");
      }
      window.location.href = "/store";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra. Vui lòng thử lại.");
      setStep("credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lp-root">
      {/* Animated aurora background */}
      <div className="lp-bg" aria-hidden="true">
        <div className="lp-aurora lp-aurora-1" />
        <div className="lp-aurora lp-aurora-2" />
        <div className="lp-aurora lp-aurora-3" />
        <div className="lp-grid-overlay" />
        {/* Floating orbs */}
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <div className="lp-orb lp-orb-3" />
      </div>

      {/* Top brand bar */}
      <header className="lp-topbar">
        <div className="lp-brand">
          <span className="lp-brand-icon">🐔</span>
          <span className="lp-brand-name">Gà ủ muối</span>
          <span className="lp-brand-badge">QUẢN LÝ</span>
        </div>
        <div className="lp-topbar-right">
          <div className="lp-status-dot" />
          <span>Hệ thống hoạt động</span>
        </div>
      </header>

      {/* Card */}
      <main className="lp-stage">
        <div className={`lp-card ${mounted ? "lp-card--visible" : ""}`}>

          {/* Card glow ring */}
          <div className="lp-card-ring" aria-hidden="true" />

          {/* Premium emblem icon */}
          <div className="lp-icon-badge" aria-hidden="true">
            <div className="lp-icon-badge-inner">
              <svg
                className="lp-emblem-svg"
                width="52"
                height="52"
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Outer hexagon ring */}
                <polygon
                  points="26,3 47,14.5 47,37.5 26,49 5,37.5 5,14.5"
                  stroke="url(#hex-grad)"
                  strokeWidth="1.2"
                  fill="none"
                  opacity="0.6"
                />
                {/* Inner hexagon */}
                <polygon
                  points="26,10 40,18 40,34 26,42 12,34 12,18"
                  stroke="url(#hex-grad)"
                  strokeWidth="0.8"
                  fill="rgba(82,196,143,0.04)"
                  opacity="0.5"
                />
                {/* Center circle */}
                <circle cx="26" cy="26" r="8.5" fill="rgba(82,196,143,0.12)" stroke="url(#hex-grad)" strokeWidth="1.2" />
                {/* G lettermark */}
                <text
                  x="26"
                  y="30.5"
                  textAnchor="middle"
                  fill="url(#text-grad)"
                  fontSize="12"
                  fontWeight="800"
                  fontFamily="system-ui, sans-serif"
                  letterSpacing="-0.5"
                >G</text>
                {/* Corner accent dots */}
                <circle cx="26" cy="3"  r="1.5" fill="#52c48f" opacity="0.9" />
                <circle cx="47" cy="14.5" r="1.2" fill="#52c48f" opacity="0.5" />
                <circle cx="47" cy="37.5" r="1.2" fill="#52c48f" opacity="0.5" />
                <circle cx="26" cy="49" r="1.5" fill="#52c48f" opacity="0.9" />
                <circle cx="5"  cy="37.5" r="1.2" fill="#52c48f" opacity="0.5" />
                <circle cx="5"  cy="14.5" r="1.2" fill="#52c48f" opacity="0.5" />
                {/* Cross-hair lines */}
                <line x1="26" y1="10" x2="26" y2="17.5" stroke="#52c48f" strokeWidth="0.6" opacity="0.4" />
                <line x1="26" y1="34.5" x2="26" y2="42" stroke="#52c48f" strokeWidth="0.6" opacity="0.4" />
                <line x1="12" y1="18" x2="17.5" y2="21.5" stroke="#52c48f" strokeWidth="0.6" opacity="0.3" />
                <line x1="34.5" y1="30.5" x2="40" y2="34" stroke="#52c48f" strokeWidth="0.6" opacity="0.3" />
                <line x1="40" y1="18" x2="34.5" y2="21.5" stroke="#52c48f" strokeWidth="0.6" opacity="0.3" />
                <line x1="17.5" y1="30.5" x2="12" y2="34" stroke="#52c48f" strokeWidth="0.6" opacity="0.3" />
                <defs>
                  <linearGradient id="hex-grad" x1="5" y1="3" x2="47" y2="49" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor="#52c48f" />
                    <stop offset="50%"  stopColor="#38a97a" />
                    <stop offset="100%" stopColor="#7cb8ff" />
                  </linearGradient>
                  <linearGradient id="text-grad" x1="20" y1="22" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%"   stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#52c48f" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="lp-icon-badge-ring" />
            <div className="lp-icon-badge-ring lp-icon-badge-ring--2" />
          </div>


          {/* Heading */}
          <div className="lp-heading">
            <p className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              SỔ CỬA HÀNG · GÀ Ủ MUỐI
            </p>
            <h1 className="lp-title">
              {step === "credentials" ? "Chào mừng trở lại" : "Xác thực 2 lớp"}
            </h1>
            <p className="lp-subtitle">
              {step === "credentials"
                ? "Đăng nhập để quản lý sổ cửa hàng và theo dõi buôn bán của bạn."
                : `Nhập mã từ ứng dụng Authenticator để hoàn tất đăng nhập cho tài khoản "${username}".`}
            </p>
          </div>

          {/* Step indicator */}
          <div className="lp-steps" role="progressbar" aria-valuenow={step === "credentials" ? 1 : 2} aria-valuemax={2}>
            <div className={`lp-step ${step === "credentials" ? "is-active" : "is-done"}`}>
              <span>1</span>
              <span>Tài khoản</span>
            </div>
            <div className="lp-step-line" data-done={step === "otp"} />
            <div className={`lp-step ${step === "otp" ? "is-active" : ""}`}>
              <span>2</span>
              <span>Xác thực</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="lp-error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: credentials */}
          {step === "credentials" && (
            <form onSubmit={handleCredentials} className="lp-form" noValidate>
              <div className="lp-field">
                <label htmlFor="lp-username">Tên đăng nhập</label>
                <div className="lp-input-wrap">
                  <input
                    id="lp-username"
                    type="text"
                    name="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    maxLength={80}
                    placeholder="Tên tài khoản của bạn"
                    autoFocus
                  />
                </div>
              </div>

              <div className="lp-field">
                <label htmlFor="lp-password">Mật khẩu</label>
                <div className="lp-input-wrap lp-input-password">
                  <input
                    id="lp-password"
                    type={visible ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    className="lp-pw-toggle"
                    aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    onClick={() => setVisible(v => !v)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="lp-submit" disabled={!username.trim() || !password.trim()}>
                <span>Tiếp theo</span>
                <ChevronRight size={18} />
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <form onSubmit={handleOtp} className="lp-form" noValidate>
              <div className="lp-field">
                <label htmlFor="lp-otp">Mã Authenticator</label>
                <div className="lp-input-wrap lp-input-otp">
                  <Fingerprint size={20} className="lp-otp-icon" aria-hidden="true" />
                  <input
                    id="lp-otp"
                    type="text"
                    name="otp"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000 000"
                    required
                    autoFocus
                  />
                  {otp.length === 6 && <div className="lp-otp-ready" aria-hidden="true">✓</div>}
                </div>
                <p className="lp-field-hint">Nhập 6 chữ số từ ứng dụng Google Authenticator hoặc Authy.</p>
              </div>

              <div className="lp-otp-actions">
                <button
                  type="button"
                  className="lp-back"
                  onClick={() => { setStep("credentials"); setOtp(""); }}
                >
                  ← Quay lại
                </button>
                <button type="submit" className="lp-submit lp-submit--otp" disabled={busy || otp.length !== 6}>
                  {busy ? (
                    <span className="lp-spinner" aria-label="Đang xử lý…" />
                  ) : (
                    <>
                      <ShieldCheck size={18} />
                      <span>Đăng nhập</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Footer */}
          <footer className="lp-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Kết nối mã hóa · Xác thực đa lớp · Tự động đăng xuất</span>
          </footer>
        </div>

        {/* Feature chips below card */}
        <div className="lp-chips" aria-hidden="true">
          <span>🔐 End-to-end encrypted</span>
          <span>📊 Sổ cửa hàng thực</span>
          <span>🤖 Trợ lý AI tích hợp</span>
        </div>
      </main>
    </div>
  );
}
