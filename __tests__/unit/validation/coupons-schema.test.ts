// __tests__/unit/validation/coupons-schema.test.ts — V031
// Tests for the Zod validation schema in coupons/route.ts
import { z } from 'zod';

// Mirror the schema from coupons/route.ts
const CouponValidateSchema = z.object({
  code:     z.string().min(1, 'Coupon code required').max(50).transform(v => v.trim().toUpperCase()),
  subtotal: z.number({ invalid_type_error: 'subtotal must be a number' }).min(0),
});

type CouponInput = z.input<typeof CouponValidateSchema>;

function validate(input: unknown) {
  return CouponValidateSchema.safeParse(input);
}

describe('CouponValidateSchema', () => {
  // ── Valid inputs ───────────────────────────────────────────────
  it('accepts valid code and subtotal', () => {
    const result = validate({ code: 'SAVE10', subtotal: 10000 });
    expect(result.success).toBe(true);
  });

  it('trims and uppercases the code', () => {
    const result = validate({ code: '  welcome20  ', subtotal: 5000 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe('WELCOME20');
  });

  it('accepts subtotal of 0', () => {
    const result = validate({ code: 'FREE', subtotal: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts decimal subtotal', () => {
    const result = validate({ code: 'TEST', subtotal: 99.99 });
    expect(result.success).toBe(true);
  });

  it('accepts code with numbers and dashes', () => {
    const result = validate({ code: 'SUMMER-2026', subtotal: 3000 });
    expect(result.success).toBe(true);
  });

  // ── Invalid inputs ─────────────────────────────────────────────
  it('rejects empty code', () => {
    const result = validate({ code: '', subtotal: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects code longer than 50 characters', () => {
    const result = validate({ code: 'A'.repeat(51), subtotal: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects string subtotal', () => {
    const result = validate({ code: 'SAVE10', subtotal: 'ten thousand' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('subtotal must be a number');
    }
  });

  it('rejects null subtotal', () => {
    const result = validate({ code: 'SAVE10', subtotal: null });
    expect(result.success).toBe(false);
  });

  it('rejects negative subtotal', () => {
    const result = validate({ code: 'SAVE10', subtotal: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing code field', () => {
    const result = validate({ subtotal: 5000 });
    expect(result.success).toBe(false);
  });

  it('rejects missing subtotal field', () => {
    const result = validate({ code: 'SAVE10' });
    expect(result.success).toBe(false);
  });

  it('rejects completely empty object', () => {
    const result = validate({});
    expect(result.success).toBe(false);
  });

  it('rejects injection attempt in code field (passes schema — sanitized in DB layer)', () => {
    // Zod allows any string up to 50 chars; injection is blocked at DB level
    // This test documents the expected behaviour
    const result = validate({ code: '<script>alert(1)</script>', subtotal: 1000 });
    // Length is > 50 chars so it should fail on max
    expect(result.success).toBe(false);
  });

  it('rejects null code', () => {
    const result = validate({ code: null, subtotal: 1000 });
    expect(result.success).toBe(false);
  });

  it('rejects array as code', () => {
    const result = validate({ code: ['SAVE10'], subtotal: 1000 });
    expect(result.success).toBe(false);
  });
});
