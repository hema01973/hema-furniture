// __tests__/unit/security/rbac-matrix.test.ts — V031
// V014 FIX: Role × Permission matrix tests.
// Every role is tested against every permission — grants AND denials.
// If a permission is added/removed from authz.ts without updating this file,
// the test suite fails loudly instead of silently missing coverage.
import { hasPermission, ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/authz';

// ── Expected grants per role ──────────────────────────────────────
const MATRIX: Record<string, string[]> = {
  admin: [...PERMISSIONS], // admin gets everything

  manager: [
    'read:product', 'write:product', 'delete:product',
    'read:order:any', 'write:order', 'cancel:order:any', 'refund:order',
    'read:user:any', 'block:user',
    'read:coupon', 'write:coupon',
    'delete:review:any',
    'read:analytics', 'read:audit',
    'upload:file',
    'auth:self',
  ],

  staff: [
    // staff is a legacy alias for manager — same permissions
    'read:product', 'write:product', 'delete:product',
    'read:order:any', 'write:order', 'cancel:order:any', 'refund:order',
    'read:user:any', 'block:user',
    'read:coupon', 'write:coupon',
    'delete:review:any',
    'read:analytics', 'read:audit',
    'upload:file',
    'auth:self',
  ],

  support: [
    'read:product',
    'read:order:any', 'write:order',
    'read:user:any',
    'read:coupon',
    'delete:review:any',
    'read:audit',
    'auth:self',
  ],

  customer: [
    'read:order:own', 'cancel:order:own',
    'read:user:own', 'write:user:own',
    'write:review:own',
    'manage:wishlist:own',
    'auth:self',
  ],
};

// ── Build the full denial matrix (what each role must NOT have) ───
function deniedPermissions(role: string): string[] {
  const granted = new Set(MATRIX[role] ?? []);
  return PERMISSIONS.filter(p => !granted.has(p));
}

// ── Tests ─────────────────────────────────────────────────────────
describe('RBAC matrix — ROLE_PERMISSIONS catalog completeness', () => {
  it('every role in MATRIX has an entry in ROLE_PERMISSIONS', () => {
    for (const role of Object.keys(MATRIX)) {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
    }
  });

  it('every role in ROLE_PERMISSIONS is covered by MATRIX', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(MATRIX).toHaveProperty(role);
    }
  });
});

describe.each(Object.keys(MATRIX))('Role: %s', (role) => {
  const granted = MATRIX[role];
  const denied  = deniedPermissions(role);

  if (granted.length > 0) {
    describe('✅ granted permissions', () => {
      test.each(granted)('%s → true', (perm) => {
        expect(hasPermission(role, perm as never)).toBe(true);
      });
    });
  }

  if (denied.length > 0) {
    describe('🚫 denied permissions', () => {
      test.each(denied)('%s → false', (perm) => {
        expect(hasPermission(role, perm as never)).toBe(false);
      });
    });
  }
});

describe('RBAC matrix — edge cases', () => {
  it('unknown role is denied every permission', () => {
    for (const perm of PERMISSIONS) {
      expect(hasPermission('hacker', perm)).toBe(false);
    }
  });

  it('undefined role is denied every permission', () => {
    for (const perm of PERMISSIONS) {
      expect(hasPermission(undefined, perm)).toBe(false);
    }
  });

  it('empty string role is denied every permission', () => {
    for (const perm of PERMISSIONS) {
      expect(hasPermission('', perm)).toBe(false);
    }
  });

  it('admin has ALL permissions — no gaps', () => {
    for (const perm of PERMISSIONS) {
      expect(hasPermission('admin', perm)).toBe(true);
    }
  });

  it('customer cannot access any admin-only permission', () => {
    const adminOnly = [
      'delete:product', 'delete:user', 'block:user', 'change:role',
      'read:analytics', 'read:audit', 'upload:file', 'refund:order',
      'read:order:any', 'cancel:order:any', 'read:user:any',
    ];
    for (const perm of adminOnly) {
      expect(hasPermission('customer', perm as never)).toBe(false);
    }
  });

  it('support cannot mutate products or issue refunds', () => {
    const forbidden = ['write:product', 'delete:product', 'refund:order', 'change:role', 'delete:user'];
    for (const perm of forbidden) {
      expect(hasPermission('support', perm as never)).toBe(false);
    }
  });

  it('manager cannot change roles or delete users (reserved for admin)', () => {
    expect(hasPermission('manager', 'change:role')).toBe(false);
    expect(hasPermission('manager', 'delete:user')).toBe(false);
  });
});
