import { afterEach, expect, it, vi } from "vitest";
import Home from "../src/app/page";
import { StoreApp } from "../src/components/store-app";
import { ChatApp } from "../src/components/chat-app";

afterEach(() => vi.unstubAllEnvs());
it("shows the authenticated store entry on Vercel even before Render is configured", () => {
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("STORE_BACKEND_URL", "");
  expect(Home().type).toBe(StoreApp);
});
it("keeps configured store deployments protected and preserves local chat development", () => {
  vi.stubEnv("VERCEL", ""); vi.stubEnv("STORE_BACKEND_URL", "http://127.0.0.1:4000");
  expect(Home().type).toBe(StoreApp);
  vi.stubEnv("STORE_BACKEND_URL", "");
  expect(Home().type).toBe(ChatApp);
});
