import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 }
      }
    }
  ],
  // Divi serveri: multiplayer WS serveris (4000) + web klients (3000). MP smoke tests
  // izmanto reālo browser→WS→room engine ceļu; pārējie e2e lieto tikai web serveri.
  // MP serveris prasa uzbūvētu `apps/server/dist` (CI to būvē pirms Playwright soļa).
  webServer: [
    {
      command: "node dist/index.js",
      cwd: "./apps/server",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        HTTP_PORT: "4000",
        DATABASE_URL: ":memory:",
        NODE_ENV: "development"
      }
    },
    {
      command: "npm run dev -- --hostname=127.0.0.1 --port=3000",
      cwd: "./apps/web",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: "ignore",
      stderr: "pipe"
    }
  ]
});
