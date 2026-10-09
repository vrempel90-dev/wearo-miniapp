import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch {}
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --webpack",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
