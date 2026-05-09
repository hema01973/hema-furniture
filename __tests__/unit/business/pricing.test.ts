// __tests__/unit/business/pricing.test.ts
// Pure unit tests — no DB, no network, no mocks needed
import {
  calculateSubtotal, calculateShipping, applyCoupon, calculateOrderTotals,
} from '@/lib/business';

// ── calculateSubtotal ─────────────────────────────────────────────
describe('calculateSubtotal()', () => {
  it('returns 0 for empty cart', () => {
    expect(calculateSubtotal([])).toBe(0);
  });
  it('correctly multiplies price × quantity', () => {
    expect(calculateSubtotal([{ price: 1000, quantity: 3 }])).toBe(3000);
  });
  it('sums multiple items', () => {
    expect(calculateSubtotal([
      { price: 500,  quantity: 2 },
      { price: 1500, quantity: 1 },
    ])).toBe(2500);
  });
  it('handles fractional prices', () => {
    expect(calculateSubtotal([{ price: 99.99, quantity: 2 }])).toBeCloseTo(199.98);
  });
  it('throws on negative price', () => {
    expect(() => calculateSubtotal([{ price: -100, quantity: 1 }])).toThrow();
  });
  it('throws on negative quantity', () => {
    expect(() => calculateSubtotal([{ price: 100, quantity: -1 }])).toThrow();
  });
  it('handles zero-price item', () => {
    expect(calculateSubtotal([{ price: 0, quantity: 5 }])).toBe(0);
  });
});

// ── calculateShipping ─────────────────────────────────────────────
describe('calculateShipping()', () => {
  it('charges 299 below threshold', ()  => expect(calculateShipping(4999)).toBe(299));
  it('is free at threshold (5000)',  ()  => expect(calculateShipping(5000)).toBe(0));
  it('is free above threshold',     ()  => expect(calculateShipping(10000)).toBe(0));
  it('charges 299 on zero subtotal',()  => expect(calculateShipping(0)).toBe(299));
});

// ── applyCoupon ───────────────────────────────────────────────────
const BASE_PCT   = { type: 'percentage' as const, value: 10, minOrderValue: 0, isActive: true, expiresAt: null, maxUses: undefined, usedCount: 0 };
const BASE_FIXED = { type: 'fixed'      as const, value: 500, minOrderValue: 0, isActive: true, expiresAt: null };

describe('applyCoupon()', () => {
  // Happy path
  it('applies 10% on 2000 → 200',       () => expect(applyCoupon(2000, BASE_PCT)).toBe(200));
  it('applies 100% discount',            () => expect(applyCoupon(1000, { ...BASE_PCT, value: 100 })).toBe(1000));
  it('applies fixed 500 on 2000',        () => expect(applyCoupon(2000, BASE_FIXED)).toBe(500));
  it('caps fixed to subtotal (300<500)', () => expect(applyCoupon(300,  BASE_FIXED)).toBe(300));

  // Failure cases (test failure before success)
  it('returns 0 — inactive coupon',          () => expect(applyCoupon(1000, { ...BASE_PCT, isActive: false })).toBe(0));
  it('returns 0 — expired coupon',           () => expect(applyCoupon(1000, { ...BASE_PCT, expiresAt: new Date(0) })).toBe(0));
  it('returns 0 — subtotal below minimum',   () => expect(applyCoupon(500,  { ...BASE_PCT, minOrderValue: 1000 })).toBe(0));
  it('returns 0 — maxUses exhausted',        () => expect(applyCoupon(1000, { ...BASE_PCT, maxUses: 5, usedCount: 5 })).toBe(0));
  it('returns 0 — invalid percentage (>100)',() => expect(applyCoupon(1000, { ...BASE_PCT, value: 150 })).toBe(0));
  it('returns 0 — zero percentage',          () => expect(applyCoupon(1000, { ...BASE_PCT, value: 0 })).toBe(0));

  // Edge cases
  it('applies when exactly at minOrderValue',    () => expect(applyCoupon(1000, { ...BASE_PCT, minOrderValue: 1000 })).toBeGreaterThan(0));
  it('applies when usedCount = maxUses - 1',     () => expect(applyCoupon(1000, { ...BASE_PCT, maxUses: 5, usedCount: 4 })).toBe(100));
  it('applies when expiry is in future',         () => {
    const future = new Date(Date.now() + 3_600_000);
    expect(applyCoupon(1000, { ...BASE_PCT, expiresAt: future })).toBe(100);
  });
});

// ── calculateOrderTotals ──────────────────────────────────────────
describe('calculateOrderTotals()', () => {
  it('no coupon, below threshold → shipping 299', () => {
    const r = calculateOrderTotals([{ price: 1000, quantity: 2 }]);
    expect(r).toEqual({ subtotal: 2000, discount: 0, shipping: 299, total: 2299 });
  });

  it('no coupon, above threshold → free shipping', () => {
    const r = calculateOrderTotals([{ price: 3000, quantity: 2 }]);
    expect(r).toEqual({ subtotal: 6000, discount: 0, shipping: 0, total: 6000 });
  });

  it('coupon applied before shipping calc (discount pushes below threshold)', () => {
    // 5500 - 10% = 4950 → shipping kicks in
    const r = calculateOrderTotals([{ price: 5500, quantity: 1 }], { ...BASE_PCT, value: 10 });
    expect(r.discount).toBe(550);
    expect(r.shipping).toBe(299);
    expect(r.total).toBe(5500 - 550 + 299);
  });

  it('null coupon → discount 0', () => {
    expect(calculateOrderTotals([{ price: 1000, quantity: 1 }], null).discount).toBe(0);
  });

  it('empty cart → totals all zero except shipping', () => {
    const r = calculateOrderTotals([]);
    expect(r.subtotal).toBe(0);
    expect(r.total).toBe(299);
  });
});
