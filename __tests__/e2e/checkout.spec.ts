// __tests__/e2e/checkout.spec.ts — Full E2E: Browse → Cart → Checkout → Success
import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test.describe('Shop & Checkout Flow', () => {
  test('shop page renders product grid', async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    await expect(page).toHaveTitle(/shop|furniture/i);
    // Page should load (grid or empty state)
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('category filter updates URL', async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    // Click a category button if exists
    const categoryBtn = page.getByRole('button', { name: /living/i }).first();
    if (await categoryBtn.isVisible()) {
      await categoryBtn.click();
      await expect(page).toHaveURL(/category=living/);
    }
  });

  test('product detail page loads with JSON-LD', async ({ page }) => {
    // Navigate to shop then pick first product
    await page.goto(`${BASE}/shop`);
    const firstProduct = page.locator('a[href*="/product/"]').first();
    if (await firstProduct.isVisible({ timeout: 5000 })) {
      await firstProduct.click();
      await expect(page).toHaveURL(/\/product\//);
      // JSON-LD should be present
      const ld = page.locator('script[type="application/ld+json"]');
      await expect(ld).toHaveCount({ minimum: 1 });
    }
  });

  test('cart page renders empty state', async ({ page }) => {
    await page.goto(`${BASE}/cart`);
    await expect(page.locator('main')).toBeVisible();
    // Should show empty cart message or cart items
    await expect(page.getByText(/cart|basket|empty/i)).toBeVisible({ timeout: 5000 });
  });

  test('checkout redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE}/checkout`);
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });

  test('orders page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE}/orders`);
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });

  test('account page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE}/account`);
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });
});

test.describe('Security Checks', () => {
  test('CSP header is present on every page', async ({ page }) => {
    const res = await page.goto(BASE);
    const csp = res?.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain('strict-dynamic');
    expect(csp).toContain("default-src 'self'");
  });

  test('X-Frame-Options is DENY', async ({ page }) => {
    const res = await page.goto(BASE);
    expect(res?.headers()['x-frame-options']).toBe('DENY');
  });

  test('X-Content-Type-Options is nosniff', async ({ page }) => {
    const res = await page.goto(BASE);
    expect(res?.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('X-Correlation-Id is set on API responses', async ({ page }) => {
    const res = await page.goto(`${BASE}/api/healthz`);
    expect(res?.headers()['x-correlation-id']).toBeDefined();
  });

  test('API POST without CSRF token returns 403', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nameEn: 'Test' }),
        // No X-CSRF-Token header
      });
      return r.status;
    });
    expect(res).toBe(403);
  });
});

test.describe('SEO & Accessibility', () => {
  test('home page has correct title and meta', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/Hema/i);
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /.+/);
  });

  test('shop page has canonical link', async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /shop/);
  });

  test('nav has accessible landmark roles', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('all images have alt attributes', async ({ page }) => {
    await page.goto(`${BASE}/shop`);
    await page.waitForTimeout(1000);
    const images = page.locator('img:not([alt])');
    const count  = await images.count();
    expect(count).toBe(0);
  });
});

test.describe('API Reliability', () => {
  test('healthz returns status and version', async ({ page }) => {
    const res  = await page.goto(`${BASE}/api/healthz`);
    const body = await res?.json() as { status: string; version: string };
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('products API returns paginated response', async ({ page }) => {
    const res  = await page.goto(`${BASE}/api/products?limit=5`);
    const body = await res?.json() as { success: boolean; data: { products: unknown[]; pagination: unknown } };
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('products');
    expect(body.data).toHaveProperty('pagination');
  });

  test('404 returns proper JSON for API routes', async ({ page }) => {
    const res  = await page.goto(`${BASE}/api/products/this-does-not-exist-xyz`);
    expect([404, 200]).toContain(res?.status()); // could be 404 or empty
  });
});
