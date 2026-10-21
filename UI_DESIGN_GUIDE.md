# 🎨 VIP Design System & UI Guidelines — Gà Ủ Muối

> **Dành cho AI Agents (Codex, Claude, GPT, Gemini...):**
> Khi tạo hoặc chỉnh sửa bất kỳ giao diện người dùng (UI) nào trong dự án này, **BẮT BUỘC** phải tuân theo hướng dẫn thiết kế dưới đây để duy trì đẳng cấp thẩm mỹ "VIP / Pro / Ultra-Luxury". Không được tạo giao diện đơn điệu, mặc định hoặc mang phong cách MVP thô sơ.

---

## 1. Triết lý Thiết kế (Design Philosophy)

1. **Dark Luxury & Deep Space**: Sử dụng nền tối sâu thẳm (`#06090e` đến `#0b0f14`), không dùng màu đen thuần `#000000`. Phối hợp với ánh sáng cực quang (Aurora), neon emerald (`#10b981`), sapphire blue (`#3b82f6`) và gold accent (`#f59e0b`).
2. **Glassmorphism Nhiều Lớp (Multi-layer Glassmorphism)**: 
   - Sử dụng `backdrop-filter: blur(24px) saturate(180%)`.
   - Viền bán trong suốt (`rgba(255, 255, 255, 0.08)` đến `rgba(255, 255, 255, 0.15)`).
   - Đổ bóng đa tầng: `box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.15)`.
3. **Chuyển động Sống động (Micro-interactions & Subtle Glow)**:
   - Các khối thẻ, nút bấm và badge phải có hiệu ứng thở (`breathe`), quét sáng (`shimmer`), hoặc xoay nhẹ (`spin/pulse`).
   - Mọi tương tác hover đều có `transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1)`.
4. **Typography Hiện đại**:
   - Font chữ chính: `Plus Jakarta Sans`, `Inter`, hoặc system font hiện đại.
   - Font số liệu, mã code, OTP: `JetBrains Mono` hoặc font monospace cách điệu.
   - Phân cấp rõ rệt: Heading to đậm (`letter-spacing: -0.02em`), nhãn uppercase nhỏ (`font-size: 11px; letter-spacing: 0.1em; font-weight: 700; opacity: 0.8`).

---

## 2. Bảng Màu Chuẩn (Color Palette & Tokens)

```css
:root {
  /* Nền và Bề mặt */
  --bg-deep: #06090e;
  --bg-surface: rgba(13, 18, 28, 0.72);
  --bg-surface-hover: rgba(22, 30, 46, 0.85);
  --bg-surface-active: rgba(28, 38, 58, 0.95);

  /* Đường viền kính */
  --border-glass: rgba(255, 255, 255, 0.08);
  --border-glass-bright: rgba(255, 255, 255, 0.18);
  --border-accent: rgba(16, 185, 129, 0.35);

  /* Màu chủ đạo (Brand Accent: Emerald Ngọc Lục Bảo) */
  --accent-primary: #10b981;
  --accent-primary-hover: #059669;
  --accent-glow: rgba(16, 185, 129, 0.4);
  --accent-gradient: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
  --accent-text-gradient: linear-gradient(135deg, #34d399 0%, #38bdf8 100%);

  /* Màu phụ trợ & Cảnh báo */
  --color-gold: #f59e0b;
  --color-gold-glow: rgba(245, 158, 11, 0.3);
  --color-danger: #ef4444;
  --color-danger-glow: rgba(239, 68, 68, 0.25);
  --color-danger-bg: rgba(239, 68, 68, 0.1);

  /* Chữ & Độ tương phản */
  --text-main: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-subtle: #475569;
}
```

---

## 3. Công Thức Background Aurora & Grid Phía Sau

Để bất kỳ trang nào nhìn cũng có chiều sâu không gian, hãy luôn lồng hiệu ứng nền cực quang phía dưới:

```html
<div className="bg-aurora-wrapper" aria-hidden="true">
  <div className="aurora-blob aurora-1" />
  <div className="aurora-blob aurora-2" />
  <div className="aurora-blob aurora-3" />
  <div className="grid-overlay" />
</div>
```

```css
.bg-aurora-wrapper {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  background: radial-gradient(circle at 50% 0%, #0d1527 0%, #06090e 70%);
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.35;
  will-change: transform;
  animation: float-aurora 14s infinite ease-in-out alternate;
}

.aurora-1 {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, #10b981 0%, transparent 70%);
  top: -15%;
  left: 20%;
}

.aurora-2 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
  bottom: -20%;
  right: 15%;
  animation-duration: 18s;
  animation-delay: -5s;
}

.aurora-3 {
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, #f59e0b 0%, transparent 70%);
  top: 30%;
  right: -10%;
  opacity: 0.18;
  animation-duration: 22s;
  animation-delay: -10s;
}

.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
}

@keyframes float-aurora {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(40px, -30px) scale(1.12); }
  100% { transform: translate(-30px, 35px) scale(0.95); }
}
```

---

## 4. Công Thức Thẻ Kính Siêu Cấp (Glass Card Pattern)

```css
.vip-card {
  position: relative;
  background: rgba(13, 18, 28, 0.75);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow: 
    0 24px 70px -15px rgba(0, 0, 0, 0.65),
    0 0 0 1px rgba(255, 255, 255, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  padding: 36px 32px;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
}

.vip-card:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 32px 80px -15px rgba(0, 0, 0, 0.75),
    0 0 0 1px rgba(255, 255, 255, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
```

---

## 5. Các Thành Phần Giao Diện Chuẩn (Component Blueprints)

### A. Nút Bấm VIP (Gradient Shimmer Button)
```css
.vip-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-weight: 600;
  font-size: 15px;
  color: #ffffff;
  background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  padding: 13px 24px;
  cursor: pointer;
  box-shadow: 0 4px 20px -3px rgba(16, 185, 129, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  position: relative;
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.vip-button::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  transform: skewX(-20deg);
  transition: left 0.6s ease;
}

.vip-button:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 8px 28px -3px rgba(16, 185, 129, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.vip-button:hover::after {
  left: 150%;
}

.vip-button:active {
  transform: translateY(0);
}
```

### B. Input Trường Dữ Liệu (Neon Focus Input)
```css
.vip-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.vip-input {
  width: 100%;
  background: rgba(10, 15, 24, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #f8fafc;
  padding: 12px 16px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.vip-input:focus {
  border-color: #10b981;
  background: rgba(10, 15, 24, 0.9);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18), 0 0 18px rgba(16, 185, 129, 0.2);
}

.vip-input::placeholder {
  color: #64748b;
}
```

### C. Thông Báo Nổi (Floating Toast / Box Notification)
- **Vị trí**: Cố định ở góc trên bên phải hoặc chính giữa phía trên (`top: 24px`).
- **Hình thức**: Hộp kính nổi (`backdrop-filter: blur(20px)`), có dải màu neon viền bên trái hoặc vòng tròn icon animated, và thanh progress bar đếm ngược tự tắt.
- **Hiệu ứng**: Trượt êm (`cubic-bezier(0.16, 1, 0.3, 1)`) với fade in & scale nhẹ từ 0.95 lên 1.

---

## 6. Quy Tắc Cốt Lõi Khi Sinh Mã Giao Diện (Coding Directives)

1. **Tuyệt đối không dùng icon ổ khóa đơn giản hay các icon mặc định phèn**:
   - Ưu tiên vẽ **Custom SVG Emblem** (như Hexagon đôi, monogram lồng ghép, orbital rings phát sáng).
2. **Không để nút bấm có dạng phẳng lì (flat boring UI)**:
   - Luôn kèm `box-shadow` phát sáng nhẹ (`glow`), hiệu ứng hover shimmer và active scale.
3. **Typography luôn sắc nét**:
   - Tiếng Việt phải đầy đủ dấu, dùng font có hỗ trợ tiếng Việt mượt mà (`Plus Jakarta Sans`).
   - Các chỉ số tiền tệ (VND), mã đơn, mã xác thực OTP dùng `font-family: var(--font-mono)`.
4. **Trạng thái Loading / Skeleton**:
   - Khi đang tải, sử dụng pulse animation mượt mà trên nền kính tối, không dùng spinner mặc định của trình duyệt.
