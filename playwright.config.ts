// playwright.config.ts — V013: explicit PORT propagation to avoid silent port conflicts
import { defineConfig, devices } from '@playwright/test';

// V013 FIX: explicit port so webServer and baseURL always agree.
// Previously 'npm run dev' could silently bind to a different port if 3000
// was occupied, making every E2E test fail with ECONNREFUSED and no clear
// error message.
const PORT    = process.env.PORT ?? '3000';
const BASE    = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir:            './__tests__/e2e',
  fullyParallel:      true,
  forbidOnly:         !!process.env.CI,
  retries:            process.env.CI ? 2 : 0,
  workers:            process.env.CI ? 2 : '50%',
  reporter:           process.env.CI ? 'github' : 'html',
  timeout:            30_000,
  expect:             { timeout: 8_000 },

  use: {
    baseURL:           BASE,
    trace:             'on-first-retry',
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    actionTimeout:     10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
    {
      name:  'Mobile Chrome',
      use:   { ...devices['Pixel 5'] },
    },
    // Uncomment for full browser coverage:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari']  } },
  ],

  webServer: process.env.CI ? undefined : {
    // V013 FIX: pass PORT explicitly so Next.js binds to the same port the
    // tests use. Without this, if port 3000 is in use Next.js picks 3001+
    // silently while Playwright keeps hitting 3000 → every test times out.
    command:              `PORT=${PORT} npm run dev`,
    url:                  `${BASE}/api/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout:             60_000,
  },
});
