/**
 * TEST-002: RBAC Edge Cases — Role Escalation & Unauthorized Access
 * HemaV052
 *
 * Tests:
 * - Customer cannot access admin/manager-only permissions
 * - Manager cannot assign admin role (escalation prevention)
 * - Support cannot write products or manage coupons
 * - Unknown roles get zero permissions (deny-by-default)
 * - JWT with no role is fully blocked
 * - All permission boundaries enforced correctly
 */

import { hasPermission, ROLE_PERMISSIONS, assertCanAssignRole } from '@/lib/authz';
import type { Permission } from '@/lib/authz';

// ── Helper ─────────────────────────────────────────────────────────────────
function permsFor(role: string): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// ── Role isolation matrix ──────────────────────────────────────────────────
describe('TEST-002: RBAC — Role Isolation Matrix', () => {
  // Admin has every permission
  describe('admin', () => {
    test('has all defined permissions', () => {
      const adminPerms = permsFor('admin');
      expect(adminPerms.length).toBeGreaterThan(0);
      // spot-check critical ones
      expect(hasPermission('admin', 'delete:product')).toBe(true);
      expect(hasPermission('admin', 'refund:order')).toBe(true);
      expect(hasPermission('admin', 'change:role')).toBe(true);
      expect(hasPermission('admin', 'write:user:any')).toBe(true);
    });
  });

  // Manager cannot change roles or write arbitrary user data
  describe('manager', () => {
    test('can manage products, orders, coupons', () => {
      expect(hasPermission('manager', 'write:product')).toBe(true);
      expect(hasPermission('manager', 'write:order')).toBe(true);
      expect(hasPermission('manager', 'write:coupon')).toBe(true);
      expect(hasPermission('manager', 'refund:order')).toBe(true);
    });

    test('CANNOT change user roles (escalation prevention)', () => {
      expect(hasPermission('manager', 'change:role')).toBe(false);
    });

    test('CANNOT write arbitrary user data', () => {
      expect(hasPermission('manager', 'write:user:any')).toBe(false);
    });
  });

  // Staff is legacy alias for manager — must have identical permissions
  describe('staff (legacy alias for manager)', () => {
    test('has identical permissions to manager', () => {
      const staffPerms  = [...permsFor('staff')].sort();
      const managerPerms = [...permsFor('manager')].sort();
      expect(staffPerms).toEqual(managerPerms);
    });
  });

  // Support has read-only access to most things
  describe('support', () => {
    test('can read orders and users', () => {
      expect(hasPermission('support', 'read:order:any')).toBe(true);
      expect(hasPermission('support', 'read:user:any')).toBe(true);
    });

    test('CANNOT write products', () => {
      expect(hasPermission('support', 'write:product')).toBe(false);
      expect(hasPermission('support', 'delete:product')).toBe(false);
    });

    test('CANNOT write or delete coupons', () => {
      expect(hasPermission('support', 'write:coupon')).toBe(false);
    });

    test('CANNOT refund orders', () => {
      expect(hasPermission('support', 'refund:order')).toBe(false);
    });

    test('CANNOT change roles', () => {
      expect(hasPermission('support', 'change:role')).toBe(false);
    });

    test('CANNOT block users', () => {
      expect(hasPermission('support', 'block:user')).toBe(false);
    });
  });

  // Customer can only access their own resources
  describe('customer', () => {
    test('can access own orders and profile', () => {
      expect(hasPermission('customer', 'read:order:own')).toBe(true);
      expect(hasPermission('customer', 'cancel:order:own')).toBe(true);
      expect(hasPermission('customer', 'read:user:own')).toBe(true);
      expect(hasPermission('customer', 'write:user:own')).toBe(true);
    });

    test('CANNOT access ANY orders (cross-user data)', () => {
      expect(hasPermission('customer', 'read:order:any')).toBe(false);
      expect(hasPermission('customer', 'cancel:order:any')).toBe(false);
    });

    test('CANNOT read ANY user data', () => {
      expect(hasPermission('customer', 'read:user:any')).toBe(false);
      expect(hasPermission('customer', 'write:user:any')).toBe(false);
    });

    test('CANNOT write products', () => {
      expect(hasPermission('customer', 'write:product')).toBe(false);
      expect(hasPermission('customer', 'delete:product')).toBe(false);
    });

    test('CANNOT access analytics or audit logs', () => {
      expect(hasPermission('customer', 'read:analytics')).toBe(false);
      expect(hasPermission('customer', 'read:audit')).toBe(false);
    });

    test('CANNOT refund orders or manage coupons', () => {
      expect(hasPermission('customer', 'refund:order')).toBe(false);
      expect(hasPermission('customer', 'write:coupon')).toBe(false);
    });

    test('CANNOT change roles', () => {
      expect(hasPermission('customer', 'change:role')).toBe(false);
    });
  });
});

// ── Deny-by-default ────────────────────────────────────────────────────────
describe('TEST-002: RBAC — Deny-by-default (unknown/missing role)', () => {
  test('unknown role gets no permissions', () => {
    expect(hasPermission('superuser',  'write:product')).toBe(false);
    expect(hasPermission('root',       'delete:product')).toBe(false);
    expect(hasPermission('moderator',  'read:order:any')).toBe(false);
    expect(hasPermission('',           'read:product')).toBe(false);
  });

  test('undefined role gets no permissions', () => {
    expect(hasPermission(undefined, 'read:product')).toBe(false);
    expect(hasPermission(undefined, 'auth:self')).toBe(false);
  });

  test('null/empty string role gets no permissions', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hasPermission(null as any, 'read:product')).toBe(false);
    expect(hasPermission('',          'read:product')).toBe(false);
  });
});

// ── Role escalation prevention ─────────────────────────────────────────────
describe('TEST-002: RBAC — Role Escalation Attempts', () => {
  // assertCanAssignRole returns null (allowed) or a NextResponse (denied)
  test('admin can assign admin role', () => {
    const result = assertCanAssignRole('admin', 'targetId', 'admin');
    expect(result).toBeNull();
  });

  test('admin can downgrade admin to customer', () => {
    const result = assertCanAssignRole('admin', 'targetId', 'customer');
    expect(result).toBeNull();
  });

  test('manager CANNOT assign admin role (escalation blocked)', () => {
    const result = assertCanAssignRole('manager', 'targetId', 'admin');
    expect(result).not.toBeNull();
  });

  test('staff CANNOT assign admin role', () => {
    const result = assertCanAssignRole('staff', 'targetId', 'admin');
    expect(result).not.toBeNull();
  });

  test('support CANNOT assign any role', () => {
    // Support doesn't have change:role at all — this tests that the
    // assertCanAssignRole function enforces it even if called directly
    const result = assertCanAssignRole('support', 'targetId', 'customer');
    expect(result).not.toBeNull();
  });

  test('customer CANNOT assign any role', () => {
    const result = assertCanAssignRole('customer', 'targetId', 'customer');
    expect(result).not.toBeNull();
  });

  test('invalid target role is rejected', () => {
    const result = assertCanAssignRole('admin', 'targetId', 'superuser' as never);
    expect(result).not.toBeNull();
  });
});

// ── Permission boundary completeness ──────────────────────────────────────
describe('TEST-002: RBAC — Permission Boundary Completeness', () => {
  const PRIVILEGED_PERMS: Permission[] = [
    'change:role',
    'write:user:any',
    'delete:product',
    'refund:order',
    'cancel:order:any',
    'block:user',
    'write:coupon',
    'read:analytics',
    'read:audit',
  ];

  const NON_PRIVILEGED_ROLES = ['customer', 'support'];

  for (const role of NON_PRIVILEGED_ROLES) {
    for (const perm of PRIVILEGED_PERMS) {
      test(`${role} does NOT have privileged permission: ${perm}`, () => {
        expect(hasPermission(role, perm)).toBe(false);
      });
    }
  }

  test('every role has auth:self (own credential management)', () => {
    const authenticatedRoles = ['admin', 'manager', 'staff', 'support', 'customer'];
    for (const role of authenticatedRoles) {
      expect(hasPermission(role, 'auth:self')).toBe(true);
    }
  });
});
