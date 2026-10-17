import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Tin nhắn cho Mạch" })).toBeEnabled();
}

// Explicitly simulated transport for UI tests; never used by the application.
async function mockTransport(page: Page, mode: "success" | "slow" | "error-once" = "success") {
  await page.addInitScript(({ mode }) => {
    const originalFetch = window.fetch.bind(window);
    const state = window as typeof window & { testRequests: unknown[]; testAborted: boolean };
    state.testRequests = []; state.testAborted = false;
    let requests = 0;
    window.fetch = async (input, options) => {
      if (input !== "/api/chat") return originalFetch(input, options);
      requests++; state.testRequests.push(JSON.parse(String(options?.body)));
      if (mode === "error-once" && requests === 1) return Response.json({ error: { code: "RATE_LIMITED", message: "Kiểm thử giới hạn tốc độ. Vui lòng thử lại." } }, { status: 429 });
      const encoder = new TextEncoder();
      const parts = mode === "slow" ? ["Đang ", "trả lời ", "dần…"] : ["Xin chào! ", "**Đây là dữ liệu kiểm thử giao diện.**\n\n", "| Mục | Giá trị |\n| --- | --- |\n| Kiểm tra | Thành công |\n\n", "```js\nconst hello = 'chào';\n```\n\n<script>window.unsafe = true</script>\n\n[link](javascript:alert(1))"];
      let timer: ReturnType<typeof setTimeout>;
      let index = 0;
      let ended = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          function next() {
            if (ended) return;
            if (index < parts.length) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "delta", text: parts[index++] }) + "\n"));
              timer = setTimeout(next, mode === "slow" ? 1000 : 250);
            } else { ended = true; controller.enqueue(encoder.encode('{"type":"done"}\n')); controller.close(); }
          }
          options?.signal?.addEventListener("abort", () => { state.testAborted = true; if (!ended) { ended = true; clearTimeout(timer); controller.error(new DOMException("Aborted", "AbortError")); } });
          next();
        },
        cancel() { ended = true; clearTimeout(timer); },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
    };
  }, { mode });
}

test("real local endpoint reports missing key; history, rename, delete and theme persist", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await ready(page);
  test.skip(await page.getByRole("button", { name: "Đã cấu hình API" }).isVisible(), "Missing-key test is only run when the server has no key; it must not make a paid API call.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cùng Mạch khám phá");
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("textbox", { name: "Tin nhắn cho Mạch" }).fill("Xin chào từ kiểm thử local");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.locator(".error-card[role=alert]")).toContainText("Chưa cấu hình API key");
  await expect(page.getByRole("button", { name: "Thử lại", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Xin chào từ kiểm thử local", { exact: true }).last()).toBeVisible();
  await page.locator(".conversation-row").hover();
  await page.getByRole("button", { name: "Đổi tên Xin chào từ kiểm thử local" }).click();
  await page.getByRole("textbox", { name: "Tên cuộc trò chuyện" }).fill("Hội thoại đã đổi tên");
  await page.getByRole("button", { name: "Lưu tên" }).click();
  await expect(page.locator(".conversation-select")).toContainText("Hội thoại đã đổi tên");
  await page.getByRole("button", { name: "Chuyển sang chế độ tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Cuộc trò chuyện mới", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Hội thoại đã đổi tên", exact: true }).click();
  await expect(page.locator(".error-card[role=alert]")).toContainText("Chưa cấu hình API key");
  await page.locator(".conversation-row").filter({ hasText: "Hội thoại đã đổi tên" }).hover();
  await page.getByRole("button", { name: "Xóa Hội thoại đã đổi tên" }).click();
  await page.getByRole("button", { name: "Xóa cuộc trò chuyện", exact: true }).click();
  await expect(page.locator(".conversation-select").filter({ hasText: "Hội thoại đã đổi tên" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".conversation-select").filter({ hasText: "Hội thoại đã đổi tên" })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test("simulated streaming appears progressively, renders safe Markdown, forwards context and copies code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockTransport(page);
  await ready(page);
  const input = page.getByRole("textbox", { name: "Tin nhắn cho Mạch" });
  await input.fill("Tôi tên An");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Dừng tạo câu trả lời" })).toBeVisible();
  await expect(page.locator(".markdown")).toContainText("Xin chào!");
  await expect(page.locator("table")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo lại", exact: true })).toBeVisible();
  await expect(page.locator(".markdown script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { unsafe?: boolean }).unsafe)).toBeUndefined();
  expect(await page.locator(".markdown a").getAttribute("href")).not.toMatch(/^javascript:/);
  await page.getByRole("button", { name: "Sao chép", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("const hello = 'chào';");
  await input.fill("Tên tôi là gì?");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Tên tôi là gì?\n");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Tạo lại", exact: true })).toBeVisible();
  const requests = await page.evaluate(() => (window as typeof window & { testRequests: { messages: { role: string; content: string }[] }[] }).testRequests);
  expect(requests[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  expect(requests[1].messages[0].content).toBe("Tôi tên An");
  await page.reload();
  await expect(page.locator(".message-user")).toHaveCount(2);
  await expect(page.locator("table")).toHaveCount(2);
});

test("simulated stop aborts fetch and preserves partial output across reload", async ({ page }) => {
  await mockTransport(page, "slow");
  await ready(page);
  await page.getByRole("textbox", { name: "Tin nhắn cho Mạch" }).fill("Hãy trả lời chậm");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.locator(".markdown")).toContainText("Đang");
  await page.getByRole("button", { name: "Dừng tạo câu trả lời" }).click();
  await expect(page.getByText("Đã dừng tạo câu trả lời.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { testAborted: boolean }).testAborted)).toBe(true);
  await page.reload();
  await expect(page.getByText("Đã dừng tạo câu trả lời.", { exact: true })).toBeVisible();
  await expect(page.locator(".markdown")).toContainText("Đang");
});

test("a custom title on an empty conversation survives its first message", async ({ page }) => {
  await mockTransport(page);
  await ready(page);
  await page.getByRole("button", { name: "Cuộc trò chuyện mới", exact: true }).click();
  await page.locator(".conversation-row").hover();
  await page.getByRole("button", { name: "Đổi tên Cuộc trò chuyện mới" }).click();
  await page.getByRole("textbox", { name: "Tên cuộc trò chuyện" }).fill("Tên do tôi đặt");
  await page.getByRole("button", { name: "Lưu tên" }).click();
  await page.getByRole("textbox", { name: "Tin nhắn cho Mạch" }).fill("Câu hỏi đầu tiên");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByRole("button", { name: "Tạo lại", exact: true })).toBeVisible();
  await expect(page.locator(".conversation-select")).toHaveText("Tên do tôi đặt");
});

test("simulated failure can be retried without duplicating the user message", async ({ page }) => {
  await mockTransport(page, "error-once");
  await ready(page);
  await page.getByRole("textbox", { name: "Tin nhắn cho Mạch" }).fill("Thử lại giúp tôi");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.locator(".error-card[role=alert]")).toContainText("giới hạn tốc độ");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator("table")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo lại", exact: true })).toBeVisible();
  await expect(page.locator(".message-user")).toHaveCount(1);
});

test("mobile layout, drawer, prompt, expanding input and dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Mở danh sách hội thoại" }).click();
  await expect(page.getByRole("dialog", { name: "Danh sách cuộc trò chuyện" })).toBeVisible();
  await page.getByRole("button", { name: "Chuyển sang chế độ tối" }).click();
  await page.getByRole("button", { name: "Đóng menu", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /Cùng lập trình Từ dòng code/ }).click();
  const input = page.getByRole("textbox", { name: "Tin nhắn cho Mạch" });
  await expect(input).toContainText("async/await");
  expect((await input.boundingBox())!.height).toBeGreaterThan(40);
  await input.fill("");
  await page.screenshot({ path: "artifacts/mobile-dark.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: /^(Chờ cấu hình API|Đã cấu hình API)$/ }).click();
  await expect(page.getByRole("dialog")).toContainText(/Không dán key vào cuộc trò chuyện|Key chỉ được đọc trên server/);
  await page.getByRole("button", { name: "Đã hiểu" }).click();
  await page.route("**/api/chat", (route) => route.fulfill({ status: 503, json: { error: { code: "MISSING_API_KEY", message: "Chưa cấu hình API key (kiểm thử giao diện mobile)." } } }));
  await input.fill("Kiểm tra mobile");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.locator(".error-card[role=alert]")).toContainText("Chưa cấu hình API key");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("both model choices persist and are forwarded on the next message, including mobile", async ({ page }) => {
  await mockTransport(page, "slow");
  await ready(page);
  const picker = page.getByRole("combobox", { name: "Chọn model AI" });
  await expect(picker.locator("option")).toHaveCount(2);
  await expect(picker).toHaveValue("gpt-5.6-terra");
  await picker.selectOption("gpt-5.6-luna");
  await page.reload();
  await expect(picker).toHaveValue("gpt-5.6-luna");
  await page.getByRole("textbox", { name: "Tin nhắn cho Mạch" }).fill("Dùng Luna");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.locator(".markdown")).toContainText("Đang");
  await expect(picker).toBeDisabled();
  const luna = await page.evaluate(() => (window as typeof window & { testRequests: { model: string }[] }).testRequests[0]);
  expect(luna.model).toBe("gpt-5.6-luna");
  await page.getByRole("button", { name: "Dừng tạo câu trả lời" }).click();
  await expect(picker).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 740 });
  await picker.selectOption("gpt-5.6-terra");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(picker).toBeInViewport();
  await page.getByRole("textbox", { name: "Tin nhắn cho Mạch" }).fill("Dùng Terra");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByRole("button", { name: "Dừng tạo câu trả lời" })).toBeVisible();
  const terra = await page.evaluate(() => (window as typeof window & { testRequests: { model: string }[] }).testRequests[1]);
  expect(terra.model).toBe("gpt-5.6-terra");
  await page.getByRole("button", { name: "Dừng tạo câu trả lời" }).click();
  await page.reload();
  await expect(picker).toHaveValue("gpt-5.6-terra");
});
