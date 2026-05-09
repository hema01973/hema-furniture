// src/lib/audit.ts — HemaV050
// Enterprise audit logging service.
// Writes to MongoDB AuditLog collection (existing schema) + structured log stream.
// Fire-and-forget: never throws, never blocks the request path.
//
// Critical actions that MUST be audited (PCI-DSS / SOC2 requirement):
//   - Authentication (login, logout, MFA, password change)
//   - Authorization (permission denied, role change)
//   - Order lifecycle (create, cancel, refund)
//   - Admin actions (product create/update/delete, user block/unblock)
//   - Payment events (charge, refund, failure)
//   - Data export / sensitive reads

import { logger } from './logger';

export type AuditAction =
  // Auth
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login.failed'
  | 'auth.login.locked'
  | 'auth.mfa.enabled'
  | 'auth.mfa.disabled'
  | 'auth.mfa.failed'
  | 'auth.password.changed'
  | 'auth.password.reset'
  | 'auth.email.verified'
  // RBAC
  | 'rbac.denied'
  | 'rbac.role.changed'
  | 'rbac.user.blocked'
  | 'rbac.user.unblocked'
  // Orders
  | 'order.created'
  | 'order.status.updated'
  | 'order.cancelled'
  | 'order.refunded'
  // Products
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  // Users
  | 'user.deleted'
  | 'user.updated'
  // Payments
  | 'payment.success'
  | 'payment.failed'
  | 'payment.refund'
  // Reviews
  | 'review.approved'
  | 'review.deleted'
  // Coupons
  | 'coupon.created'
  | 'coupon.updated'
  | 'coupon.deleted'
  // Feature flags
  | 'flag.updated'
  // Data
  | 'data.export'
  | 'data.bulk.import';

export interface AuditContext {
  userId?:    string;
  actorId?:   string; // Who performed the action (may differ from userId for admin actions)
  resource?:  string;
  resourceId?: string;
  details?:   Record<string, unknown>;
  ip?:        string;
  userAgent?: string;
}

// ── Write audit entry (fire-and-forget) ──────────────────────────
export function audit(action: AuditAction, ctx: AuditContext = {}): void {
  // Always write to structured log (never dropped)
  logger.info('[Audit]', {
    audit:      true,
    action,
    userId:     ctx.userId,
    actorId:    ctx.actorId,
    resource:   ctx.resource,
    resourceId: ctx.resourceId,
    ip:         ctx.ip,
    details:    ctx.details,
  });

  // Non-blocking DB write — import lazily to avoid circular deps at module load
  void writeToDb(action, ctx).catch((e: unknown) =>
    logger.error('[Audit] DB write failed', { action, error: String(e) })
  );
}

async function writeToDb(action: AuditAction, ctx: AuditContext): Promise<void> {
  try {
    const { connectDB, AuditLog } = await import('./mongodb');
    await connectDB();
    await (AuditLog.create as any)({
      userId:     ctx.userId ?? ctx.actorId,
      action,
      resource:   ctx.resource,
      resourceId: ctx.resourceId,
      details:    ctx.details,
      ip:         ctx.ip,
      userAgent:  ctx.userAgent,
    });
  } catch {
    // Swallow — audit write failure must NEVER break the request
  }
}

// ── Convenience wrappers ──────────────────────────────────────────
export const auditAuth = {
  login:       (ctx: AuditContext) => audit('auth.login',          ctx),
  logout:      (ctx: AuditContext) => audit('auth.logout',         ctx),
  loginFailed: (ctx: AuditContext) => audit('auth.login.failed',   ctx),
  locked:      (ctx: AuditContext) => audit('auth.login.locked',   ctx),
  mfaEnabled:  (ctx: AuditContext) => audit('auth.mfa.enabled',    ctx),
  mfaFailed:   (ctx: AuditContext) => audit('auth.mfa.failed',     ctx),
  pwChanged:   (ctx: AuditContext) => audit('auth.password.changed',ctx),
};

export const auditRbac = {
  denied:      (ctx: AuditContext) => audit('rbac.denied',         ctx),
  roleChanged: (ctx: AuditContext) => audit('rbac.role.changed',   ctx),
  blocked:     (ctx: AuditContext) => audit('rbac.user.blocked',   ctx),
  unblocked:   (ctx: AuditContext) => audit('rbac.user.unblocked', ctx),
};

export const auditOrder = {
  created:     (ctx: AuditContext) => audit('order.created',       ctx),
  updated:     (ctx: AuditContext) => audit('order.status.updated',ctx),
  cancelled:   (ctx: AuditContext) => audit('order.cancelled',     ctx),
  refunded:    (ctx: AuditContext) => audit('order.refunded',      ctx),
};

export const auditPayment = {
  success:     (ctx: AuditContext) => audit('payment.success',     ctx),
  failed:      (ctx: AuditContext) => audit('payment.failed',      ctx),
  refund:      (ctx: AuditContext) => audit('payment.refund',      ctx),
};
