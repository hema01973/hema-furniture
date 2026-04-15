// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:         './__tests__/e2e',
  testMatch:       '**/*.spec.ts',
  fullyParallel:   true,
  forbidOnly:      !!process.env.CI,
  retries:         process.env.CI ? 2 : 0,
  workers:         process.env.CI ? 1 : undefined,
  reporter:        [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL:       process.env.BASE_URL ?? 'http://localhost:3000',
    trace:         'on-first-retry',
    screenshot:    'only-on-failure',
    video:         'on-first-retry',
  },

  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
    {
      name:  'Mobile Safari',
      use:   { ...devices['iPhone 14'] },
    },
  ],

  // Spin up dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command:              'npm run dev',
        url:                  'http://localhost:3000',
        reuseExistingServer:  true,
        timeout:              60_000,
      },
});
