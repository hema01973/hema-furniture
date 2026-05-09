// __tests__/unit/sanitize.test.ts
import { sanitize, sanitizeRich, sanitizeEmail, sanitizeQuery, sanitizeObject } from '@/lib/sanitize';

describe('sanitize (plain)', () => {
  it('strips all HTML tags', () => {
    expect(sanitize('<script>alert(1)</script>Hello')).toBe('Hello');
  });
  it('strips iframe', () => {
    expect(sanitize('<iframe src="evil.com"></iframe>')).toBe('');
  });
  it('preserves plain text', () => {
    expect(sanitize('Ahmed Hassan')).toBe('Ahmed Hassan');
  });
  it('handles null/undefined gracefully', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
  });
  it('trims whitespace', () => {
    expect(sanitize('  hello  ')).toBe('hello');
  });
});

describe('sanitizeRich', () => {
  it('allows safe tags', () => {
    expect(sanitizeRich('<b>Bold</b>')).toBe('<b>Bold</b>');
    expect(sanitizeRich('<p>Para</p>')).toBe('<p>Para</p>');
  });
  it('strips script tags', () => {
    expect(sanitizeRich('<script>evil()</script>')).toBe('');
  });
  it('strips style attributes', () => {
    expect(sanitizeRich('<b style="color:red">text</b>')).toBe('<b>text</b>');
  });
});

describe('sanitizeEmail', () => {
  it('lowercases and removes spaces', () => {
    expect(sanitizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
  });
});

describe('sanitizeQuery', () => {
  it('removes MongoDB operators', () => {
    expect(sanitizeQuery('{ $where: "evil" }')).not.toContain('$');
  });
  it('caps at 200 characters', () => {
    expect(sanitizeQuery('a'.repeat(300))).toHaveLength(200);
  });
});

describe('sanitizeObject', () => {
  it('sanitizes nested string fields', () => {
    const obj = {
      name:    '<script>xss</script>Ahmed',
      address: { city: '<b>Cairo</b>' },
      tags:    ['<em>tag</em>'],
    };
    const result = sanitizeObject(obj);
    expect(result.name).toBe('Ahmed');
    expect((result.address as { city: string }).city).toBe('Cairo');
    expect((result.tags as string[])[0]).toBe('tag');
  });

  it('preserves non-string fields', () => {
    const obj = { count: 42, active: true };
    const result = sanitizeObject(obj);
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
  });
});
