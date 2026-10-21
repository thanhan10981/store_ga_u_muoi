import { test, expect } from "@playwright/test";

test("attachment picker previews, removes, validates and retains files on failure", async ({ page }) => {
  let attempts = 0;
  const submissions: { message: string; attachments: {name: string; data: string}[] }[] = [];
  await page.route("**/api/store/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1);
    if (path === "session") return route.fulfill({ json: { username: "Test owner", csrf: "test-only", messages: [] } });
    if (path === "chat") {
      submissions.push(route.request().postDataJSON()); attempts++;
      return route.fulfill({ status: attempts === 1 ? 422 : 200, json: attempts === 1 ? { error: "Tệp không đọc được, hãy thử lại." } : { answer: "Đã đọc, bạn hãy bổ sung đơn giá." } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/store");
  const upload = page.getByLabel("Chọn ảnh hoặc tài liệu");
  await expect(upload).toBeAttached();
  await upload.setInputFiles({ name: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.from("bad") });
  await expect(page.getByText("Hỗ trợ PNG, JPG, WEBP, PDF, XLSX, DOCX, CSV, TXT.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tệp chờ gửi" })).toHaveCount(0);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
  await upload.setInputFiles([{ name: "hoa-don.png", mimeType: "image/png", buffer: png }, { name: "nhap-hang.csv", mimeType: "text/csv", buffer: Buffer.from("ten,so_luong\nGa,30") }]);
  await expect(page.getByRole("list", { name: "Tệp chờ gửi" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Xem ảnh hoa-don.png", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Xóa tệp nhap-hang.csv", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "artifacts/store-attachments-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Tệp không đọc được, hãy thử lại.", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Đã đọc, bạn hãy bổ sung đơn giá.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tệp chờ gửi" })).toHaveCount(0);
  expect(submissions[0].message).toBe("");
  expect(submissions[0].attachments[0]).toEqual({ name: "hoa-don.png", data: png.toString("base64") });
});
