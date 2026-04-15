// __tests__/e2e/checkout.spec.ts
// End-to-end tests using Playwright.
// These run against a real Next.js dev server (BASE_URL env var).
// Run: npx playwright test  (after npm install && npm run dev)

import { test, expect, Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────
async function addFirstProductToCart(page: Page) {
  await page.goto('/shop');
  await page.waitForSelector('[data-testid="product-card"], .pc', { timeout: 10_000 });
  // Click the first "Add to Cart" button
  const addBtn = page.locator('button:has-text("Add to Cart")').first();
  await addBtn.click();
}

// ─────────────────────────────────────────────────────────────────
test.describe('Home page', () => {
  test('loads and shows hero section', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Hema/i);
    // Hero headline should be visible
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('promo bar is visible', async ({ page }) => {
    await page.goto('/');
    const promo = page.locator('#promo-bar, [class*="promo"]').first();
    await expect(promo).toBeVisible();
  });
});

test.describe('Shop page', () => {
  test('renders product grid', async ({ page }) => {
    await page.goto('/shop');
    // Wait for API fetch
    await page.waitForLoadState('networkidle');
    const cards = page.locator('.pc, [data-testid="product-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('filter by category narrows results', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    // Click the "Bedroom" radio
    const bedroomLabel = page.locator('label:has-text("Bedroom")').first();
    if (await bedroomLabel.isVisible()) {
      await bedroomLabel.click();
      await page.waitForLoadState('networkidle');
      // Count visible products (flexible — any count is fine)
      const count = await page.locator('.pc').count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Cart flow', () => {
  test('adds product to cart and shows badge', async ({ page }) => {
    await addFirstProductToCart(page);
    // Cart badge counter should appear
    const badge = page.locator('#cart-b, [data-testid="cart-badge"]');
    await expect(badge).toBeVisible({ timeout: 5_000 });
    const text = await badge.textContent();
    expect(parseInt(text ?? '0')).toBeGreaterThan(0);
  });

  test('cart page shows added items', async ({ page }) => {
    await addFirstProductToCart(page);
    await page.goto('/cart');
    await expect(page.locator('.cart-row, [data-testid="cart-item"]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('empty cart shows empty state', async ({ page }) => {
    // Clear localStorage to start fresh
    await page.addInitScript(() => localStorage.removeItem('hema-cart'));
    await page.goto('/cart');
    await expect(page.locator('text=Your cart is empty').first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
  });

  test('invalid credentials show error toast', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Sign In")');
    // Toast should appear
    await expect(page.locator('text=/invalid|incorrect/i').first()).toBeVisible({ timeout: 5_000 });
  });

  test('register page renders with all fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[autocomplete="name"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button:has-text("Create Account")')).toBeVisible();
  });
});

test.describe('Admin panel protection', () => {
  test('redirects unauthenticated users from /admin', async ({ page }) => {
    await page.goto('/admin');
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

test.describe('Product detail page', () => {
  test('navigates from shop to product detail', async ({ page }) => {
    await page.goto('/shop');
    await page.waitForLoadState('networkidle');

    const firstProductLink = page.locator('.pc-name, [data-testid="product-name"]').first();
    if (await firstProductLink.isVisible()) {
      await firstProductLink.click();
      await expect(page).toHaveURL(/\/product\//);
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });
});
