import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  webServer: {
    command:
      "env CI=1 XDG_CONFIG_HOME=/tmp npm run dev:backend:e2e",
    url: "http://127.0.0.1:8797/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    trace: "retain-on-failure",
  },
});
