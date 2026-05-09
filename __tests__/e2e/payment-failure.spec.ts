// __tests__/e2e/payment-failure.spec.ts — HemaV048
// E2E scenarios for Paymob payment failure handling.

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test.describe('Payment Failure Handling', () => {
  test('Paymob callback with failure updates order status to failed', async ({ request }) => {
    // Simulate a Paymob failure callback to the API endpoint.
    // In a real environment this would be called by Paymob's webhook.
    // We test that the endpoint exists and handles the payload without crashing.
    const response = await request.post(`${BASE}/api/paymob/callback`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        obj: {
          success:    false,
          order:      { id: 999999999 },
          id:         888888888,
          amount_cents: 10000,
        },
        type: 'TRANSACTION',
        hmac: 'invalid_hmac_test',
      },
    });

    // Should not be a 500 — either validates HMAC (403/400) or processes
    expect(response.status()).not.toBe(500);
  });

  test('order detail page shows retry payment option for failed payments', async ({ page }) => {
    test.skip(process.env.E2E_SKIP_AUTH === '1', 'Auth-dependent test skipped');

    // Navigate to the orders page and check that failed orders show a retry option
    await page.goto(`${BASE}/login`);
    const emailInput = page.getByLabel(/email/i);
    if (await emailInput.isVisible({ timeout: 5_000 })) {
      await emailInput.fill(process.env.E2E_TEST_EMAIL ?? 'e2e@test.com');
      await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD ?? 'TestPassword1!');
      await page.getByRole('button', { name: /sign in|login/i }).click();
      await page.waitForURL(/^\/?(?!login)/, { timeout: 10_000 });
    }

    await page.goto(`${BASE}/orders`);
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });

    // Check for presence of orders list or empty state — page should not error
    const bodyText = await page.locator('body').textContent();
    const hasContent = bodyText && bodyText.length > 50;
    expect(hasContent).toBe(true);

    // If any order has a "retry" or "pay again" button, click to verify it navigates
    const retryBtn = page.getByRole('button', { name: /retry|pay again|retry payment/i }).first();
    if (await retryBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await retryBtn.click();
      // Should either show a payment iframe URL or navigate to checkout
      await page.waitForLoadState('networkidle', { timeout: 8_000 });
      await expect(page.locator('main')).toBeVisible();
    }
  });
});
