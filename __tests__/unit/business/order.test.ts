// __tests__/unit/business/order.test.ts
import {
  checkStockAvailability, formatOrderNumber,
  egpToCents, requiresOnlinePayment,
} from '@/lib/business';

// ── checkStockAvailability ────────────────────────────────────────
describe('checkStockAvailability()', () => {
  const makeItem = (available: number, requested: number, nameEn = 'Sofa') => ({
    productId: 'abc', nameEn, available, requested,
  });

  it('passes when all items have sufficient stock', () => {
    const result = checkStockAvailability([
      makeItem(10, 2, 'Sofa'),
      makeItem(5, 5, 'Chair'),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when one item is out of stock', () => {
    const result = checkStockAvailability([makeItem(0, 1)]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/0 unit/);
  });

  it('fails when requested > available', () => {
    const result = checkStockAvailability([makeItem(3, 5, 'Oslo Sofa')]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"Oslo Sofa"');
    expect(result.errors[0]).toContain('3 unit');
  });

  it('fails when quantity is zero or negative', () => {
    const r0 = checkStockAvailability([makeItem(10, 0)]);
    const rN = checkStockAvailability([makeItem(10, -1)]);
    expect(r0.valid).toBe(false);
    expect(rN.valid).toBe(false);
  });

  it('passes when exactly at stock limit', () => {
    expect(checkStockAvailability([makeItem(5, 5)]).valid).toBe(true);
  });

  it('collects all errors (not just first)', () => {
    const result = checkStockAvailability([
      makeItem(0, 1, 'A'),
      makeItem(1, 5, 'B'),
    ]);
    expect(result.errors).toHaveLength(2);
  });

  it('passes for empty cart', () => {
    expect(checkStockAvailability([]).valid).toBe(true);
  });

  it('uses singular "unit" for exactly 1 available', () => {
    const result = checkStockAvailability([makeItem(1, 2)]);
    expect(result.errors[0]).toMatch(/1 unit(?!s)/);
  });
});

// ── formatOrderNumber ─────────────────────────────────────────────
describe('formatOrderNumber()', () => {
  it('pads sequence to 5 digits', () => {
    expect(formatOrderNumber(1,     2024)).toBe('HEM-2024-00001');
    expect(formatOrderNumber(42,    2024)).toBe('HEM-2024-00042');
    expect(formatOrderNumber(99999, 2024)).toBe('HEM-2024-99999');
  });

  it('uses current year when not provided', () => {
    const result = formatOrderNumber(1);
    expect(result).toContain(String(new Date().getFullYear()));
  });

  it('throws on zero sequence', () => {
    expect(() => formatOrderNumber(0)).toThrow();
  });

  it('throws on negative sequence', () => {
    expect(() => formatOrderNumber(-1)).toThrow();
  });
});

// ── egpToCents ────────────────────────────────────────────────────
describe('egpToCents()', () => {
  it('converts 100 EGP to 10000 cents', ()  => expect(egpToCents(100)).toBe(10000));
  it('converts 0.5 EGP to 50 cents',    ()  => expect(egpToCents(0.5)).toBe(50));
  it('converts 0 EGP to 0 cents',       ()  => expect(egpToCents(0)).toBe(0));
  it('rounds fractional cents',          ()  => expect(egpToCents(1.999)).toBe(200));
  it('throws on negative amount',        ()  => expect(() => egpToCents(-1)).toThrow());
});

// ── requiresOnlinePayment ─────────────────────────────────────────
describe('requiresOnlinePayment()', () => {
  it('paymob → true',  () => expect(requiresOnlinePayment('paymob')).toBe(true));
  it('card → true',    () => expect(requiresOnlinePayment('card')).toBe(true));
  it('cod → false',    () => expect(requiresOnlinePayment('cod')).toBe(false));
  it('fawry → false',  () => expect(requiresOnlinePayment('fawry')).toBe(false));
  it('valu → false',   () => expect(requiresOnlinePayment('valu')).toBe(false));
  it('empty → false',  () => expect(requiresOnlinePayment('')).toBe(false));
});
