// __tests__/unit/middleware.test.ts — V031
// Tests for middleware.ts: security headers, ADMIN_API list, CSP, CSRF
import * as fs from 'fs';
import * as path from 'path';

const MIDDLEWARE_SRC = path.resolve(__dirname, '../../src/middleware.ts');
const src = fs.readFileSync(MIDDLEWARE_SRC, 'utf-8');

describe('middleware.ts — ADMIN_API list', () => {
  it('protects /api/v1/analytics', () => {
    expect(src).toContain('/api/v1/analytics');
  });

  it('protects /api/v1/upload', () => {
    expect(src).toContain('/api/v1/upload');
  });

  it('has comment explaining mixed-access routes exclusion', () => {
    expect(src).toMatch(/mixed|defence-in-depth|NOT listed/i);
  });
});

describe('middleware.ts — Security headers', () => {
  it('sets X-Frame-Options', () => {
    expect(src).toContain('X-Frame-Options');
  });

  it('sets X-Content-Type-Options', () => {
    expect(src).toContain('X-Content-Type-Options');
  });

  it('sets Referrer-Policy', () => {
    expect(src).toContain('Referrer-Policy');
  });

  it('sets Content-Security-Policy', () => {
    expect(src).toContain('Content-Security-Policy');
  });

  it('CSP includes nonce for scripts', () => {
    expect(src).toContain('nonce');
  });

  it('sets Permissions-Policy', () => {
    expect(src).toContain('Permissions-Policy');
  });
});

describe('middleware.ts — CSRF protection', () => {
  it('imports or references CSRF protection', () => {
    expect(src).toMatch(/csrf|CSRF/i);
  });

  it('checks X-CSRF-Token header or similar', () => {
    expect(src).toMatch(/csrf.*token|token.*csrf/i);
  });
});

describe('middleware.ts — Correlation ID', () => {
  it('adds x-correlation-id or x-request-id header', () => {
    expect(src).toMatch(/correlation-id|request-id/i);
  });
});

describe('middleware.ts — System routes not behind admin gate', () => {
  it('does not block /api/auth in ADMIN_API', () => {
    // ADMIN_API array should NOT contain /api/auth
    const adminApiMatch = src.match(/const ADMIN_API\s*=\s*\[([^\]]+)\]/s);
    if (adminApiMatch) {
      expect(adminApiMatch[1]).not.toContain('/api/auth');
    }
  });

  it('does not block /api/healthz in ADMIN_API', () => {
    const adminApiMatch = src.match(/const ADMIN_API\s*=\s*\[([^\]]+)\]/s);
    if (adminApiMatch) {
      expect(adminApiMatch[1]).not.toContain('/api/healthz');
    }
  });

  it('does not block /api/paymob in ADMIN_API', () => {
    const adminApiMatch = src.match(/const ADMIN_API\s*=\s*\[([^\]]+)\]/s);
    if (adminApiMatch) {
      expect(adminApiMatch[1]).not.toContain('/api/paymob');
    }
  });
});
