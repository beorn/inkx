import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "*.playwright.ts",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:7681",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // Don't run in parallel since we have one ttyd server
  workers: 1,
});
