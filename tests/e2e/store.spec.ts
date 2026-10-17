import { test, expect } from "@playwright/test";

test("login hides store data, toggles password visibility and rejects invalid or unverified sessions", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/store/**", async route => {
    if (route.request().url().endsWith("/login")) {
      attempts++;
      return route.fulfill({ status: attempts === 1 ? 401 : 200, json: attempts === 1 ? { error: "Tên đăng nhập hoặc mật khẩu không đúng." } : { username: "owner", csrf: "test-only" } });
    }
    return route.fulfill({ status: 401, json: { error: "Vui lòng đăng nhập." } });
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Đăng nhập quản lý" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Báo cáo từ sổ cửa hàng" })).toHaveCount(0);
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill("owner");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("test-only-password");
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Hiện mật khẩu", exact: true }).click();
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
  await page.getByLabel("Mã Authenticator", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Tên đăng nhập hoặc mật khẩu không đúng.");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Chưa xác minh được phiên đăng nhập.");
  await expect(page.getByRole("heading", { name: "Báo cáo từ sổ cửa hàng" })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/store-login.png", fullPage: true });
});

test("simulated store workflow: login, review draft, confirm once, inspect report and logout", async ({ page }) => {
  let loggedIn = false;
  let confirmed = 0;
  const draft = { id: "12345678-1234-4234-8234-123456789012", payload: { kind: "purchase", date: "2026-10-17", note: "", lines: [{ name: "Gà ủ muối", unit: "con", quantity: 30, unitPrice: 120000 }, { name: "Hộp", unit: "cái", quantity: 50, unitPrice: 3000 }] } };
  await page.route("**/api/store/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1);
    if (path === "session") return route.fulfill({ status: loggedIn ? 200 : 401, json: loggedIn ? { username: "owner", csrf: "test-only", messages: [] } : { error: "Vui lòng đăng nhập." } });
    if (path === "login") { loggedIn = true; return route.fulfill({ json: { username: "owner", csrf: "test-only" } }); }
    if (path === "chat") return route.fulfill({ json: { answer: "Đây là phiếu nháp, hãy kiểm tra trước khi xác nhận.", draft } });
    if (path === "confirm") { confirmed++; return route.fulfill({ json: { receiptId: draft.id, alreadyConfirmed: false } }); }
    if (path === "reports") return route.fulfill({ json: { report: { query: { from: "2026-10-01", to: "2026-10-17", bucket: "day", item: "" }, revenue: "0", purchases: "3750000", expenses: "0", cashDifference: "-3750000", note: "Chênh lệch thu chi không phải lợi nhuận.", series: [], products: [], inventory: [{ name: "Gà ủ muối", unit: "con", stock: "30" }], truncated: { products: false, inventory: false } } } });
    if (path === "logout") { loggedIn = false; return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 404, json: { error: "Unsupported test route" } });
  });
  await page.goto("/store");
  await page.getByLabel("Tên đăng nhập").fill("owner");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("simulated-password");
  await page.getByLabel("Mã Authenticator").fill("123456");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Nhắn cho trợ lý").fill("Nhập 30 con gà giá 120k/con và 50 hộp giá 3k/cái");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("PHIẾU NHÁP · CHƯA GHI SỔ")).toBeVisible();
  await expect(page.getByText("Tổng: 3.750.000 ₫")).toBeVisible();
  expect(confirmed).toBe(0);
  await page.screenshot({ path: "artifacts/store-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "artifacts/store-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Xác nhận và ghi sổ" }).click();
  await expect(page.getByRole("status")).toContainText("Đã ghi sổ thành công");
  expect(confirmed).toBe(1);
  await expect(page.getByRole("button", { name: "Xác nhận và ghi sổ" })).toHaveCount(0);
  await page.getByRole("button", { name: "Xem báo cáo" }).click();
  await expect(page.getByText("Chênh lệch thu chi không phải lợi nhuận.")).toBeVisible();
  await expect(page.getByText("30 con", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập quản lý" })).toBeVisible();
});
