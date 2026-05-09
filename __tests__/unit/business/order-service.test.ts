// __tests__/unit/business/order-service.test.ts — V031: order.service unit tests
import { calculateShipping, calculateSubtotal, applyCoupon } from '@/lib/business';

describe('calculateShipping()', () => {
  it('returns 0 for subtotal >= 5000 (free shipping threshold)', () => {
    expect(calculateShipping(5000)).toBe(0);
    expect(calculateShipping(10000)).toBe(0);
    expect(calculateShipping(5001)).toBe(0);
  });

  it('returns 299 for subtotal < 5000', () => {
    expect(calculateShipping(4999)).toBe(299);
    expect(calculateShipping(0)).toBe(299);
    expect(calculateShipping(1)).toBe(299);
  });

  it('applies discount before threshold check', () => {
    // subtotal=5000, discount=1 → effective=4999 → should pay shipping
    expect(calculateShipping(5000, 1)).toBe(299);
    // subtotal=5001, discount=1 → effective=5000 → free
    expect(calculateShipping(5001, 1)).toBe(0);
  });

  it('returns 0 when discount makes effective value exactly 5000', () => {
    expect(calculateShipping(6000, 1000)).toBe(0);
  });
});

describe('applyCoupon()', () => {
  it('applies percentage coupon correctly', () => {
    const { discount } = applyCoupon({ type: 'percentage', value: 10 }, 10000);
    expect(discount).toBe(1000);
  });

  it('applies fixed-amount coupon correctly', () => {
    const { discount } = applyCoupon({ type: 'fixed', value: 500 }, 10000);
    expect(discount).toBe(500);
  });

  it('caps percentage discount to subtotal (no negative totals)', () => {
    const { discount } = applyCoupon({ type: 'percentage', value: 200 }, 1000);
    expect(discount).toBeLessThanOrEqual(1000);
  });

  it('caps fixed discount to subtotal (no negative totals)', () => {
    const { discount } = applyCoupon({ type: 'fixed', value: 9999999 }, 1000);
    expect(discount).toBeLessThanOrEqual(1000);
  });

  it('returns 0 discount when coupon value is 0', () => {
    expect(applyCoupon({ type: 'percentage', value: 0 }, 10000).discount).toBe(0);
    expect(applyCoupon({ type: 'fixed',      value: 0 }, 10000).discount).toBe(0);
  });

  it('rounds percentage discount to integer', () => {
    // 10% of 9999 = 999.9 → should round to integer
    const { discount } = applyCoupon({ type: 'percentage', value: 10 }, 9999);
    expect(Number.isInteger(discount)).toBe(true);
  });
});

describe('calculateSubtotal() — full suite', () => {
  it('handles large order correctly', () => {
    const items = Array.from({ length: 10 }, () => ({ price: 5000, quantity: 3 }));
    expect(calculateSubtotal(items)).toBe(150000);
  });

  it('handles single item with quantity 1', () => {
    expect(calculateSubtotal([{ price: 8500, quantity: 1 }])).toBe(8500);
  });

  it('handles mixed quantities', () => {
    expect(calculateSubtotal([
      { price: 1000, quantity: 5 },
      { price: 2000, quantity: 2 },
      { price: 500,  quantity: 10 },
    ])).toBe(14000);
  });
});
