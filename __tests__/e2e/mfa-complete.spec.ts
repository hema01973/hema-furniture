// __tests__/e2e/mfa-complete.spec.ts — HemaV048
// E2E scenarios for MFA login flow: correct TOTP, incorrect TOTP.

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const MFA_TEST_EMAIL    = process.env.E2E_MFA_EMAIL    ?? '';
const MFA_TEST_PASSWORD = process.env.E2E_MFA_PASSWORD ?? '';
const MFA_TEST_TOTP     = process.env.E2E_MFA_TOTP     ?? '';

test.describe('MFA Login Flow', () => {
  test.skip(!MFA_TEST_EMAIL, 'MFA test credentials not configured (set E2E_MFA_EMAIL, E2E_MFA_PASSWORD, E2E_MFA_TOTP)');

  test('login with correct TOTP grants dashboard access', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(MFA_TEST_EMAIL);
    await page.getByLabel(/password/i).fill(MFA_TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should redirect to MFA verification page
    await page.waitForURL(/mfa|two-factor|verify/i, { timeout: 10_000 });
    await expect(page.locator('main')).toBeVisible();

    // Enter the (pre-seeded or env-provided) TOTP code
    const totpInput = page.getByLabel(/code|otp|authenticator/i).or(page.getByPlaceholder(/6.digit|totp|code/i));
    await totpInput.waitFor({ timeout: 5_000 });
    await totpInput.fill(MFA_TEST_TOTP);

    const verifyBtn = page.getByRole('button', { name: /verify|confirm|submit/i });
    await verifyBtn.click();

    // Should redirect to dashboard or home — not login page
    await page.waitForURL(/^\/?(?!login|mfa|two-factor|verify)/, { timeout: 10_000 });
    await expect(page.locator('main')).toBeVisible();

    // Confirm we're not on the login or MFA page
    expect(page.url()).not.toMatch(/login|mfa|two-factor|verify/);
  });

  test('incorrect TOTP shows error and prevents login', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(MFA_TEST_EMAIL);
    await page.getByLabel(/password/i).fill(MFA_TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await page.waitForURL(/mfa|two-factor|verify/i, { timeout: 10_000 });

    // Submit a wrong TOTP code
    const totpInput = page.getByLabel(/code|otp|authenticator/i).or(page.getByPlaceholder(/6.digit|totp|code/i));
    await totpInput.waitFor({ timeout: 5_000 });
    await totpInput.fill('000000'); // wrong code

    const verifyBtn = page.getByRole('button', { name: /verify|confirm|submit/i });
    await verifyBtn.click();

    // Should stay on MFA page and show an error
    await expect(page.getByText(/invalid|incorrect|wrong|error/i)).toBeVisible({ timeout: 8_000 });
    expect(page.url()).toMatch(/mfa|two-factor|verify/);
  });
});
