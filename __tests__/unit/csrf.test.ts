// __tests__/unit/csrf.test.ts — CSRF token build + validation
import { buildCsrfToken, validateCsrfToken } from '@/lib/csrf';

process.env.NEXTAUTH_SECRET = 'a'.repeat(32);

describe('CSRF Protection', () => {
  it('builds a valid token with 3 parts', async () => {
    const token = await buildCsrfToken();
    expect(token.split('.')).toHaveLength(3);
  });

  it('validates matching cookie and header values', async () => {
    const token = await buildCsrfToken();
    const valid  = await validateCsrfToken(token, token);
    expect(valid).toBe(true);
  });

  it('rejects mismatched values', async () => {
    const token = await buildCsrfToken();
    const other = await buildCsrfToken();
    expect(await validateCsrfToken(token, other)).toBe(false);
  });

  it('rejects missing cookie', async () => {
    const token = await buildCsrfToken();
    expect(await validateCsrfToken(undefined, token)).toBe(false);
  });

  it('rejects missing header', async () => {
    const token = await buildCsrfToken();
    expect(await validateCsrfToken(token, undefined)).toBe(false);
  });

  it('rejects tampered expiry', async () => {
    const token  = await buildCsrfToken();
    const parts  = token.split('.');
    parts[1]     = String(Date.now() - 1000); // expired
    const tampered = parts.join('.');
    expect(await validateCsrfToken(tampered, tampered)).toBe(false);
  });

  it('rejects malformed token (wrong part count)', async () => {
    expect(await validateCsrfToken('only.two', 'only.two')).toBe(false);
  });
});
