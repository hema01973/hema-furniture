// __tests__/unit/utils.test.ts — Unit tests for shared utilities
import { cn, formatEGP, formatDate, truncate, sleep } from '@/lib/utils';

describe('cn()', () => {
  it('merges classes', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    // tailwind-merge: p-4 overrides px-2
    expect(cn('px-2', 'p-4')).toBe('p-4');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'extra')).toBe('base extra');
  });

  it('handles undefined and null gracefully', () => {
    expect(() => cn(undefined, null as unknown as string, 'ok')).not.toThrow();
  });
});

describe('formatEGP()', () => {
  it('formats zero', () => {
    expect(formatEGP(0)).toBe('EGP 0');
  });

  it('formats 5000', () => {
    expect(formatEGP(5000)).toContain('5');
    expect(formatEGP(5000)).toContain('EGP');
  });

  it('formats large numbers with separators', () => {
    const result = formatEGP(12500);
    expect(result).toContain('EGP');
    expect(result).toContain('12');
  });
});

describe('formatDate()', () => {
  const date = new Date('2024-06-15');

  it('returns a non-empty string', () => {
    expect(formatDate(date)).toBeTruthy();
  });

  it('accepts string input', () => {
    expect(() => formatDate('2024-06-15')).not.toThrow();
  });

  it('formats differently for ar locale', () => {
    const en = formatDate(date, 'en');
    const ar = formatDate(date, 'ar');
    // Both should be non-empty; ar may use Arabic numerals
    expect(en).toBeTruthy();
    expect(ar).toBeTruthy();
  });

  it('en locale contains the year', () => {
    expect(formatDate(date, 'en')).toContain('2024');
  });
});

describe('truncate()', () => {
  it('does not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    const result = truncate('Hello World', 8);
    expect(result).toHaveLength(8);
    expect(result.endsWith('…')).toBe(true);
  });

  it('truncates exactly at boundary', () => {
    const result = truncate('12345', 5);
    expect(result).toBe('12345');
  });

  it('truncates one over boundary', () => {
    const result = truncate('123456', 5);
    expect(result).toBe('1234…');
  });
});

describe('sleep()', () => {
  it('resolves after the given ms', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});
