// __tests__/unit/business/product.test.ts
import { computeBadge, buildSlug, validatePasswordStrength } from '@/lib/business';

describe('computeBadge()', () => {
  it('returns null when out of stock', () => expect(computeBadge(100, undefined, 0)).toBeNull());
  it('returns Limited when stock ≤ 5',  () => expect(computeBadge(100, undefined, 3)).toBe('Limited'));
  it('returns Sale when oldPrice > price', () => expect(computeBadge(800, 1000, 10)).toBe('Sale'));
  it('returns null when no discount and ample stock', () => expect(computeBadge(1000, undefined, 50)).toBeNull());
  it('returns null when oldPrice <= price', () => expect(computeBadge(1000, 800, 10)).toBeNull());
  it('returns Limited at exactly 5 units', () => expect(computeBadge(100, undefined, 5)).toBe('Limited'));
  it('returns Sale (not Limited) when 6+ units but discounted', () => expect(computeBadge(800, 1000, 6)).toBe('Sale'));
});

describe('buildSlug()', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(buildSlug('Oslo Sofa')).toBe('oslo-sofa');
  });
  it('removes special characters', () => {
    expect(buildSlug('Café & Co!')).toBe('caf-co');
  });
  it('collapses multiple hyphens', () => {
    expect(buildSlug('A  B   C')).toBe('a-b-c');
  });
  it('trims leading and trailing spaces', () => {
    expect(buildSlug('  sofa  ')).toBe('sofa');
  });
  it('caps at 100 characters', () => {
    expect(buildSlug('a'.repeat(200))).toHaveLength(100);
  });
  it('handles Arabic (removes non-ASCII)', () => {
    expect(buildSlug('أريكة Sofa')).toBe('sofa');
  });
  it('handles empty string', () => {
    expect(buildSlug('')).toBe('');
  });
});

describe('validatePasswordStrength()', () => {
  it('passes a strong password',      () => expect(validatePasswordStrength('Strong@123').valid).toBe(true));
  it('fails on too short (<8)',        () => {
    const r = validatePasswordStrength('Ab1!');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('8'))).toBe(true);
  });
  it('fails on too long (>128)',       () => {
    expect(validatePasswordStrength('A1!' + 'a'.repeat(130)).valid).toBe(false);
  });
  it('fails without uppercase',        () => {
    const r = validatePasswordStrength('lower123!');
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('uppercase'))).toBe(true);
  });
  it('fails without number',           () => {
    expect(validatePasswordStrength('NoNumber!').valid).toBe(false);
  });
  it('fails without special char',     () => {
    expect(validatePasswordStrength('NoSpecial1').valid).toBe(false);
  });
  it('returns all errors at once',     () => {
    const r = validatePasswordStrength('ab');
    expect(r.errors.length).toBeGreaterThan(1);
  });
  it('passes exactly at 8 chars minimum', () => {
    expect(validatePasswordStrength('Abcd1!ab').valid).toBe(true);
  });
});
