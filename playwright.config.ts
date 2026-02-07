import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: process.env.TEST_URL || "https://traidgov-analyst-2.vercel.app",
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
});
