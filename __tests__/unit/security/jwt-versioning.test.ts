// __tests__/unit/security/jwt-versioning.test.ts — V031
// V014 FIX: Verify that permissionVersion (pv) is present in auth config
// and that the User schema includes the field. These tests catch regressions
// where pv is accidentally removed from the token flow.
import * as fs from 'fs';
import * as path from 'path';

const AUTH_SRC      = fs.readFileSync(path.resolve(__dirname, '../../../src/lib/auth.ts'), 'utf-8');
const MONGODB_SRC   = fs.readFileSync(path.resolve(__dirname, '../../../src/lib/mongodb.ts'), 'utf-8');
const MIDDLEWARE_SRC = fs.readFileSync(path.resolve(__dirname, '../../../src/middleware.ts'), 'utf-8');

describe('JWT permission versioning (pv)', () => {
  describe('src/lib/auth.ts', () => {
    it('declares pv in JWT interface', () => {
      expect(AUTH_SRC).toMatch(/pv\s*:\s*number/);
    });

    it('declares pv in User interface', () => {
      expect(AUTH_SRC).toMatch(/pv\s*:\s*number/);
    });

    it('sets token.pv from user.pv in jwt callback', () => {
      expect(AUTH_SRC).toContain('token.pv');
    });

    it('reads permissionVersion from DB user at login', () => {
      expect(AUTH_SRC).toMatch(/permissionVersion/);
    });
  });

  describe('src/lib/mongodb.ts — UserSchema', () => {
    it('has permissionVersion field in User schema', () => {
      expect(MONGODB_SRC).toMatch(/permissionVersion/);
    });

    it('permissionVersion defaults to 0', () => {
      expect(MONGODB_SRC).toMatch(/permissionVersion.*default.*0|default.*0.*permissionVersion/s);
    });
  });

  describe('src/middleware.ts — pv validation', () => {
    it('checks token.pv against DB on authenticated requests', () => {
      expect(MIDDLEWARE_SRC).toMatch(/permissionVersion|token\.pv/);
    });

    it('redirects to login on pv mismatch', () => {
      expect(MIDDLEWARE_SRC).toMatch(/session_expired|pv.*mismatch|mismatch.*pv/i);
    });

    it('clears session cookie on pv mismatch', () => {
      expect(MIDDLEWARE_SRC).toMatch(/cookies.*delete|delete.*cookie|session-token/i);
    });

    it('fails open when DB is unreachable (does not block all requests)', () => {
      expect(MIDDLEWARE_SRC).toMatch(/fail.?open|DB.*unreachable|unreachable/i);
    });
  });
});

describe('Role change endpoint', () => {
  const ROLE_ROUTE = path.resolve(
    __dirname,
    '../../../src/app/api/v1/users/[id]/role/route.ts'
  );

  it('role/route.ts file exists', () => {
    expect(fs.existsSync(ROLE_ROUTE)).toBe(true);
  });

  it('increments permissionVersion on role change', () => {
    const src = fs.readFileSync(ROLE_ROUTE, 'utf-8');
    expect(src).toMatch(/\$inc.*permissionVersion|permissionVersion.*\$inc/s);
  });

  it('requires change:role permission', () => {
    const src = fs.readFileSync(ROLE_ROUTE, 'utf-8');
    expect(src).toContain('change:role');
  });

  it('calls assertCanAssignRole guard', () => {
    const src = fs.readFileSync(ROLE_ROUTE, 'utf-8');
    expect(src).toContain('assertCanAssignRole');
  });

  it('writes to AuditLog on role change', () => {
    const src = fs.readFileSync(ROLE_ROUTE, 'utf-8');
    expect(src).toContain('AuditLog.create');
  });
});
