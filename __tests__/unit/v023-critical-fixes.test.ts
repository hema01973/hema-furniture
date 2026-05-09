// __tests__/unit/v023-critical-fixes.test.ts
// V027: Unit tests covering the three critical bugs fixed in V027.
// These tests ensure regressions cannot be re-introduced silently.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─────────────────────────────────────────────────────────────────────────────
// FIX #1: authSession declared before coupon block in order.service.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('order.service — authSession declaration order (Critical #1)', () => {
  it('authSession is resolved before currentUserId is referenced', async () => {
    // Read the source and verify declaration order by line number.
    // This is a structural test that fails if someone moves the declaration
    // back below the coupon block.
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/order.service.ts'),
      'utf-8',
    );
    const lines = src.split('\n');

    const authSessionDeclarationLine = lines.findIndex(l =>
      l.includes('const authSession = await getAuthSession()')
    );
    const currentUserIdUsageLine = lines.findIndex(l =>
      l.includes('const currentUserId') && l.includes('authSession')
    );

    expect(authSessionDeclarationLine).toBeGreaterThan(-1);
    expect(currentUserIdUsageLine).toBeGreaterThan(-1);
    expect(authSessionDeclarationLine).toBeLessThan(currentUserIdUsageLine);
  });

  it('authSession is declared exactly once in createOrder', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/order.service.ts'),
      'utf-8',
    );
    const matches = src.match(/const authSession = await getAuthSession\(\)/g) ?? [];
    // Should appear exactly once in the file
    expect(matches).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #2: collision variable declared before use in products/route.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('products/route — hadCollision variable declaration (Critical #2)', () => {
  it('hadCollision is declared before the for loop', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/v1/products/route.ts'),
      'utf-8',
    );
    const lines = src.split('\n');

    const declarationLine = lines.findIndex(l =>
      l.includes('let hadCollision') || l.includes('let hadCollision = false')
    );
    const forLoopLine = lines.findIndex(l =>
      l.trim().startsWith('for (let attempt')
    );
    const usageLine = lines.findIndex(l =>
      l.includes('hadCollision') && !l.includes('let hadCollision')
    );

    expect(declarationLine).toBeGreaterThan(-1);
    expect(forLoopLine).toBeGreaterThan(-1);
    expect(usageLine).toBeGreaterThan(-1);

    // Declaration must come before the loop and before usage
    expect(declarationLine).toBeLessThan(forLoopLine);
    expect(declarationLine).toBeLessThan(usageLine);
  });

  it('no reference to undefined `collision` variable remains', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/v1/products/route.ts'),
      'utf-8',
    );
    // The old bug: `attempt > 0 || collision` with undeclared `collision`
    // The fix: `attempt > 0 || hadCollision` with declared `hadCollision`
    expect(src).not.toMatch(/\|\|\s*collision\b(?!\w)/);
    expect(src).toMatch(/\|\|\s*hadCollision/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX #3: Idempotency key sent from CheckoutPage
// ─────────────────────────────────────────────────────────────────────────────
describe('CheckoutPage — idempotency key (Critical #3)', () => {
  it('CheckoutPage imports useRef', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/checkout/CheckoutPage.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/import\s*\{[^}]*useRef[^}]*\}\s*from\s*['"]react['"]/);
  });

  it('idempotencyKeyRef is declared with useRef', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/checkout/CheckoutPage.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/idempotencyKeyRef\s*=\s*useRef/);
  });

  it('Idempotency-Key header is included in the order POST request', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/checkout/CheckoutPage.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/['"]Idempotency-Key['"]/);
    expect(src).toMatch(/idempotencyKeyRef\.current/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HIGH #1: Reviews require moderation (not auto-approved)
// ─────────────────────────────────────────────────────────────────────────────
describe('reviews/route — moderation queue (High #1)', () => {
  it('new reviews are created with isApproved: false', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/v1/reviews/route.ts'),
      'utf-8',
    );
    // Must NOT contain the auto-approve pattern
    expect(src).not.toMatch(/isApproved:\s*true,\s*\/\/ auto-approve/);
    // Must contain the new pattern
    expect(src).toMatch(/isApproved:\s*false/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HIGH #3: /wishlist route is protected by middleware
// ─────────────────────────────────────────────────────────────────────────────
describe('middleware — /wishlist route protection (High #3)', () => {
  it('PROTECTED_PATHS includes /wishlist', async () => {
    const fs   = await import('fs');
    const path = await import('path');
    const src  = fs.readFileSync(
      path.resolve(process.cwd(), 'src/middleware.ts'),
      'utf-8',
    );
    expect(src).toMatch(/PROTECTED_PATHS\s*=\s*\[.*['"]\/wishlist['"]/s);
  });
});
