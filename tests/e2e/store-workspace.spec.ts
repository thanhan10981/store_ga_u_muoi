import { test, expect } from "@playwright/test";

test("inventory deletion shows before/after and keeps a stale proposal for review", async ({ page }) => {
  let confirmations = 0;
  const before = { id:"test-product",name:"Dưa leo",unit:"kg",stock:"5.000",archived:false,revision:"1" };
  const proposal = { id:"test-inventory-draft",payload:{ type:"inventory",operation:"archive_product",date:"2026-10-21",reason:"Chủ yêu cầu ngừng quản lý",before,after:{...before,stock:"0.000",archived:true} } };
  await page.route("**/api/store/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1);
    if (path === "session") return route.fulfill({json:{ username:"Chủ cửa hàng",csrf:"test-only",messages:[],draft:proposal }});
    if (path === "confirm") { confirmations++; return route.fulfill({status:409,json:{error:"Kho đã thay đổi. Hãy tạo lại đề xuất."}}); }
    if (path === "cancel") return route.fulfill({json:{ok:true}});
    return route.fulfill({status:404,json:{}});
  });
  await page.goto("/store");
  await expect(page.getByRole("heading",{name:"Xóa mặt hàng khỏi kho",exact:true})).toBeVisible();
  await expect(page.getByRole("cell",{name:"Sau xác nhận",exact:true})).toHaveCount(0);
  await expect(page.getByRole("columnheader",{name:"Sau xác nhận"})).toBeVisible();
  await expect(page.getByText("Xác nhận sẽ đưa số tồn về 0 và ẩn mặt hàng.",{exact:false})).toBeVisible();
  expect(confirmations).toBe(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:"artifacts/inventory-review-mobile.png",fullPage:true});
  await page.getByRole("button",{name:"Xác nhận xóa khỏi kho"}).click();
  await expect(page.getByText("Kho đã thay đổi. Hãy tạo lại đề xuất.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Xác nhận xóa khỏi kho"})).toBeVisible();
  expect(confirmations).toBe(1);
  await page.getByRole("button",{name:"Hủy phiếu",exact:true}).click();
  await expect(page.getByRole("button",{name:"Xác nhận xóa khỏi kho"})).toHaveCount(0);
});

test("store workspace keeps draft confirmation explicit and fits desktop and mobile", async ({ page }) => {
  let confirmations = 0;
  const draft = { id: "test-draft", payload: { kind: "purchase", date: "2026-10-21", note: "Phiếu kiểm thử", lines: [{ name: "Gà ủ muối", unit: "con", quantity: 30, unitPrice: 120000 }] } };
  await page.route("**/api/store/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/").at(-1);
    if (path === "session") return route.fulfill({ json: { username: "Chủ cửa hàng", csrf: "test-only", messages: [] } });
    if (path === "chat") return route.fulfill({ json: { answer: "Đã chuẩn bị phiếu nháp. Bạn kiểm tra đơn giá trước khi ghi sổ nhé.", draft } });
    if (path === "confirm") { confirmations++; return route.fulfill({ json: { receiptId: "TEST-001" } }); }
    if (path === "reports") return route.fulfill({ json: { report: { query: { from: "2026-10-01", to: "2026-10-21", bucket: "day", item: "" }, revenue: "8500000", purchases: "3600000", expenses: "200000", cashDifference: "4700000", note: "Chênh lệch thu chi không phải lợi nhuận.", series: [], inventory: [{ name: "Gà ủ muối", unit: "con", stock: "30" }], products: [], truncated: { products: false, inventory: false } } } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/store");
  await expect(page.getByRole("heading", { name: "Hôm nay cửa hàng thế nào?" })).toBeVisible();
  await page.getByRole("button", { name: "Hôm nay nhập 30 con gà ủ muối" }).click();
  await expect(page.getByLabel("Nhắn cho trợ lý")).toHaveValue("Hôm nay nhập 30 con gà ủ muối");
  await page.screenshot({ path: "artifacts/store-workspace-desktop.png", fullPage: true });
  await page.getByLabel("Nhắn cho trợ lý").fill("Nhập 30 con gà giá 120000đ/con");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Tổng: 3.600.000 ₫")).toBeVisible();
  expect(confirmations).toBe(0);
  await page.getByRole("button", { name: "Xem báo cáo" }).click();
  await expect(page.getByText("Chênh lệch thu chi không phải lợi nhuận.")).toBeVisible();
  await page.screenshot({ path: "artifacts/store-workspace-data.png", fullPage: true });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `artifacts/store-workspace-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Xác nhận và ghi sổ" }).click();
  await expect(page.getByRole("button", { name: "Xác nhận và ghi sổ" })).toHaveCount(0);
  expect(confirmations).toBe(1);
});
