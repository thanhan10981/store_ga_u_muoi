import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", ...devices["Desktop Edge"], channel: "msedge" },
  webServer: { command: "npm run start", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "" }, timeout: 30_000 },
});
