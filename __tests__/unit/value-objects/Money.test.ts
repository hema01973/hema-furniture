// __tests__/unit/value-objects/Money.test.ts — V049
// TEST-GAP-02 FIX: unit tests for Money value object.
// Money uses integer piastre storage to prevent IEEE-754 drift in financial calculations.

import { Money } from '@/domain/shared/value-objects/Money';

describe('Money', () => {
  // ── Construction ──────────────────────────────────────────────────────────
  describe('fromEGP', () => {
    it('creates a Money instance from EGP amount', () => {
      expect(Money.fromEGP(10).toEGP()).toBe(10);
    });

    it('prevents IEEE-754 drift: 0.1 + 0.2 === 0.3', () => {
      expect(Money.fromEGP(0.1).add(Money.fromEGP(0.2)).toEGP()).toBe(0.3);
    });

    it('handles fractional EGP correctly', () => {
      expect(Money.fromEGP(99.99).toEGP()).toBe(99.99);
    });

    it('throws on negative amount', () => {
      expect(() => Money.fromEGP(-1)).toThrow('cannot be negative');
    });

    it('throws on non-finite amount', () => {
      expect(() => Money.fromEGP(Infinity)).toThrow('finite');
      expect(() => Money.fromEGP(NaN)).toThrow('finite');
    });

    it('allows zero', () => {
      expect(Money.fromEGP(0).toEGP()).toBe(0);
    });
  });

  describe('fromCents', () => {
    it('creates correct EGP from cents', () => {
      expect(Money.fromCents(1000).toEGP()).toBe(10);
    });

    it('throws on negative cents', () => {
      expect(() => Money.fromCents(-1)).toThrow('cannot be negative');
    });
  });

  describe('zero', () => {
    it('returns a zero Money instance', () => {
      expect(Money.zero().toEGP()).toBe(0);
      expect(Money.zero().isZero()).toBe(true);
    });
  });

  // ── Arithmetic ────────────────────────────────────────────────────────────
  describe('add', () => {
    it('adds two Money values correctly', () => {
      expect(Money.fromEGP(10).add(Money.fromEGP(5)).toEGP()).toBe(15);
    });

    it('handles fractional addition without drift', () => {
      const result = Money.fromEGP(33.33).add(Money.fromEGP(33.33)).add(Money.fromEGP(33.34));
      expect(result.toEGP()).toBe(100);
    });
  });

  describe('subtract', () => {
    it('subtracts two Money values correctly', () => {
      expect(Money.fromEGP(10).subtract(Money.fromEGP(3)).toEGP()).toBe(7);
    });

    it('clamps to zero when result would be negative', () => {
      expect(Money.fromEGP(5).subtract(Money.fromEGP(10)).toEGP()).toBe(0);
    });
  });

  describe('multiply', () => {
    it('multiplies correctly for integer factors', () => {
      expect(Money.fromEGP(10).multiply(3).toEGP()).toBe(30);
    });

    it('rounds correctly for fractional prices', () => {
      // 33.33 * 3 = 99.99 — not 99.99000000000001
      expect(Money.fromEGP(33.33).multiply(3).toEGP()).toBe(99.99);
    });

    it('throws on negative factor', () => {
      expect(() => Money.fromEGP(10).multiply(-1)).toThrow('cannot be negative');
    });

    it('multiplies by zero to give zero', () => {
      expect(Money.fromEGP(100).multiply(0).toEGP()).toBe(0);
    });
  });

  // ── Comparison ────────────────────────────────────────────────────────────
  describe('comparisons', () => {
    it('greaterThan works correctly', () => {
      expect(Money.fromEGP(10).greaterThan(Money.fromEGP(5))).toBe(true);
      expect(Money.fromEGP(5).greaterThan(Money.fromEGP(10))).toBe(false);
    });

    it('lessThan works correctly', () => {
      expect(Money.fromEGP(5).lessThan(Money.fromEGP(10))).toBe(true);
      expect(Money.fromEGP(10).lessThan(Money.fromEGP(5))).toBe(false);
    });

    it('equals works correctly', () => {
      expect(Money.fromEGP(10).equals(Money.fromEGP(10))).toBe(true);
      expect(Money.fromEGP(10).equals(Money.fromEGP(9.99))).toBe(false);
    });

    it('isZero works correctly', () => {
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.fromEGP(0.01).isZero()).toBe(false);
    });
  });

  // ── Conversion ────────────────────────────────────────────────────────────
  describe('toCents', () => {
    it('returns integer cents', () => {
      expect(Money.fromEGP(10).toCents()).toBe(1000);
      expect(Money.fromEGP(99.99).toCents()).toBe(9999);
    });
  });

  describe('toString', () => {
    it('formats as EGP string', () => {
      expect(Money.fromEGP(10).toString()).toBe('10.00 EGP');
      expect(Money.fromEGP(0.5).toString()).toBe('0.50 EGP');
    });
  });

  // ── Real-world order scenarios ────────────────────────────────────────────
  describe('order total calculation', () => {
    it('calculates subtotal for multiple items without float drift', () => {
      // Simulates: 2x 1499.50 EGP sofa + 3x 299.99 EGP chair
      const sofas = Money.fromEGP(1499.50).multiply(2);   // 2999.00
      const chairs = Money.fromEGP(299.99).multiply(3);   // 899.97
      const total = sofas.add(chairs);
      expect(total.toEGP()).toBe(3898.97);
    });

    it('Paymob cents conversion is integer-safe', () => {
      // 1234.56 EGP → 123456 cents (exact integer, no float)
      expect(Money.fromEGP(1234.56).toCents()).toBe(123456);
    });
  });
});
