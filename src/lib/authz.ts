// src/lib/authz.ts — HemaV066
// V064 FIX-LOW-02: emitDenialAlert() now uses the securityAlert email type instead
//   of reusing adminPaymentAlert with a synthetic order object.
// ──────────────────────────────────────────────────────────────────
// V005 NEW: Single source of truth for "who can do what".
// V007 FIX 5: All permission denials are now written to the persistent AuditLog
//   collection in MongoDB (in addition to the logger.warn already present).
//   Previously, denials existed only in transient log output — forensic review
//   after an incident had no queryable record. The DB write is fire-and-forget
//   (non-blocking) so it cannot slow down or crash the request path.
//
// Design principles:
//   1. Deny by default — no permission ⇒ 403, period.
//   2. Permissions are strings of the form `verb:resource` so a route
//      can declare exactly what it needs without caring about roles.
//   3. The role → permissions map below is the ONLY place a new role
//      gains capabilities; nothing else needs to change.
//   4. Resource-level (ownership) checks are a separate, explicit step
//      — RBAC says "this role can read orders"; ownership says "and
//      THIS specific order belongs to them". Both are required for
//      mutations on user-owned data.

import type { NextRequest } from 'next/server';
import { NextResponse }     from 'next/server';
import { getAuthSession }   from './auth';
import { err }              from './api';
import { logger }           from './logger';
import type { UserRole }    from '@/types';

// ── Permission catalog ────────────────────────────────────────────
export const PERMISSIONS = [
  // Products
  'read:product',
  'write:product',
  'delete:product',
  // Orders
  'read:order:any',
  'read:order:own',
  'write:order',
  'cancel:order:any',
  'cancel:order:own',
  'refund:order',
  // Users
  'read:user:any',
  'read:user:own',
  'write:user:own',
  'delete:user',
  'block:user',
  'change:role',
  // Coupons
  'read:coupon',
  'write:coupon',
  'delete:coupon',
  // Reviews
  'write:review:own',
  'delete:review:any',
  // Admin tooling
  'read:analytics',
  'read:audit',
  'upload:file',
  // CRIT-03 FIX (V067): Added 'read:admin' — required by /admin/redis-health and
  // /admin/audit-integrity endpoints. Previously missing, making those routes
  // permanently inaccessible (requirePermission always returned 403).
  'read:admin',
  // HIGH-02 FIX (V053): dedicated write permission for Feature Flags.
  // Previously POST /api/v1/admin/feature-flags used 'read:analytics',
  // allowing support role (who has read:analytics) to modify Feature Flags.
  'write:feature-flags',
  // Wishlist (per-user)
  'manage:wishlist:own',
  // Self-account actions (password change, MFA setup, email verify)
  // V010: replaces ad-hoc `withAuth(...)` checks on /api/auth/* routes.
  'auth:self',
] as const;

export type Permission = typeof PERMISSIONS[number];

// ── Role → permissions map ────────────────────────────────────────
// `staff` is kept as an alias for `manager` for backwards compatibility
// with existing JWTs in the wild.
const _ADMIN: Permission[] = [...PERMISSIONS];

const _MANAGER: Permission[] = [
  'read:product', 'write:product', 'delete:product',
  'read:order:any', 'write:order', 'cancel:order:any', 'refund:order',
  'read:user:any', 'block:user',
  'read:coupon', 'write:coupon',
  'delete:review:any',
  'read:analytics', 'read:audit',
  'upload:file',
  'write:feature-flags', // HIGH-02 FIX (V053): managers can update feature flags
  'auth:self', // V010
];

const _SUPPORT: Permission[] = [
  'read:product',
  'auth:self', // V010
  'read:order:any', 'write:order',
  'read:user:any',
  'read:coupon',
  'delete:review:any',
  'read:audit',
];

const _CUSTOMER: Permission[] = [
  'read:order:own', 'cancel:order:own',
  'read:user:own', 'write:user:own',
  'write:review:own',
  'manage:wishlist:own',
  'auth:self', // V010
];

// Every authenticated role gets `auth:self` — managing your own credentials
// is not a privileged action. Add to support/manager too.

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  admin:    _ADMIN,
  manager:  _MANAGER,
  staff:    _MANAGER,        // legacy alias
  support:  _SUPPORT,
  customer: _CUSTOMER,
};

// ── Core check ────────────────────────────────────────────────────
export function hasPermission(role: string | undefined, perm: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(perm);
}

// ── Persistent denial logger ──────────────────────────────────────
// V007 FIX 5: Write every denial to MongoDB AuditLog for forensic queries.
// Fire-and-forget — errors are swallowed so this never affects the response.
function persistDenial(details: {
  userId?:   string;
  role?:     string;
  required:  string | string[];
  kind:      'permission' | 'ownership' | 'role-escalation';
  actor?:    string;
  target?:   string;
}): void {
  // Lazy import to avoid circular dependency at module load time
  import('@/lib/mongodb').then(({ connectDB, AuditLog }) =>
    connectDB().then(() =>
      (AuditLog.create as any)({
        userId:   details.userId ?? details.actor,
        action:   `authz.deny.${details.kind}`,
        resource: Array.isArray(details.required) ? details.required.join('|') : details.required,
        details: {
          role:     details.role,
          required: details.required,
          actor:    details.actor,
          target:   details.target,
        },
      })
    )
  ).catch(() => { /* fire-and-forget — never throw */ });

  // V010 (W8): real-time burst detection. When the same actor accumulates
  // ≥5 denials in 60 s, we forward an alert to the email queue so on-call
  // sees it. Counter lives in Redis (so multi-instance deployments share
  // state) with a graceful in-memory fallback.
  void emitDenialAlert(details).catch(() => {});
}

const DENIAL_BURST_WINDOW_S = 60;
const DENIAL_BURST_THRESHOLD = 5;
// In-process fallback when Redis is unavailable
const _localDenialCounts = new Map<string, { n: number; resetAt: number }>();
// V063 FIX-LOW-02: Evict expired entries when map exceeds threshold.
// Previously the map grew without bound in long-lived processes.
const LOCAL_DENIAL_MAP_MAX = 10_000;

async function emitDenialAlert(details: {
  userId?: string; role?: string; required: string | string[]; kind: string; actor?: string;
}): Promise<void> {
  const subject = details.userId ?? details.actor ?? 'anonymous';
  const key = `authz:denial:${subject}`;
  let count = 0;

  try {
    const { getRedis } = await import('./redis');
    const redis = await getRedis();
    if (redis) {
      // INCR + EXPIRE-on-first is the cheapest reliable counter
      const pipe = redis.pipeline();
      pipe.incr(key);
      pipe.expire(key, DENIAL_BURST_WINDOW_S);
      const res = await pipe.exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } else {
      throw new Error('redis unavailable');
    }
  } catch {
    const now = Date.now();
    // LOW-03 FIX (V066): LRU-style eviction when map is full.
    // V063 only removed expired entries — if all entries were still active (e.g. burst
    // within the same 60s window), zero entries were removed and new subjects couldn't
    // get a counter slot, silently dropping denial alerts.
    // Fix: after removing expired entries, if still at capacity, evict the entry with
    // the lowest count (least-threatening, best candidate for eviction).
    if (_localDenialCounts.size > LOCAL_DENIAL_MAP_MAX) {
      for (const [k, v] of _localDenialCounts) {
        if (v.resetAt < now) _localDenialCounts.delete(k);
      }
      // If still at capacity after expiry-pruning, evict lowest-count entry
      if (_localDenialCounts.size >= LOCAL_DENIAL_MAP_MAX) {
        let leastKey: string | null = null;
        let leastCount = Infinity;
        for (const [k, v] of _localDenialCounts) {
          if (v.n < leastCount) { leastCount = v.n; leastKey = k; }
        }
        if (leastKey) _localDenialCounts.delete(leastKey);
      }
    }
    const slot = _localDenialCounts.get(key);
    if (!slot || slot.resetAt < now) {
      _localDenialCounts.set(key, { n: 1, resetAt: now + DENIAL_BURST_WINDOW_S * 1000 });
      count = 1;
    } else {
      slot.n += 1;
      count = slot.n;
    }
  }

  // Only alert ON CROSSING the threshold (not every subsequent denial), so
  // ops doesn't get N alerts per attacker.
  if (count !== DENIAL_BURST_THRESHOLD) return;

  logger.error('[Authz] denial-burst alert', {
    subject, count, windowSec: DENIAL_BURST_WINDOW_S,
    role: details.role, required: details.required, kind: details.kind,
  });

  // Forward to email queue if admin alert email is configured.
  // Fire-and-forget; failures already logged above.
  if (!process.env.ADMIN_ALERT_EMAIL) return;
  try {
    const { enqueueEmail } = await import('./queue');
    // LOW-02 FIX (V064): Use the dedicated securityAlert email type instead of reusing
    // adminPaymentAlert with a synthetic order. This provides proper severity labelling
    // and removes the need for a cast-away of type safety.
    await enqueueEmail({
      type:     'securityAlert',
      severity: 'high',
      subject:  `Authz burst detected: ${subject}`,
      body:     `kind=${details.kind} required=${details.required} role=${details.role} count=${count}/${DENIAL_BURST_WINDOW_S}s`,
    }, `authz-burst:${subject}:${Math.floor(Date.now() / (DENIAL_BURST_WINDOW_S * 1000))}`);
  } catch (e) {
    logger.warn('[Authz] alert enqueue failed', { error: String(e) });
  }
}

// ── Route guards ──────────────────────────────────────────────────
export type AuthSession = NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
export type AuthzResult =
  | { ok: true;  session: AuthSession }
  | { ok: false; response: NextResponse };

export async function requirePermission(
  _req: NextRequest,
  perm: Permission,
): Promise<AuthzResult> {
  const session = await getAuthSession();
  if (!session) {
    return { ok: false, response: err('Unauthorized', 401, 'UNAUTHORIZED') };
  }
  const role = session.user.role as UserRole | string;
  if (!hasPermission(role, perm)) {
    logger.warn('[Authz] permission denied', {
      userId: session.user.id, role, required: perm,
    });
    // V007 FIX 5: persist denial to DB
    persistDenial({ userId: session.user.id, role, required: perm, kind: 'permission' });
    return { ok: false, response: err('Forbidden', 403, 'FORBIDDEN') };
  }
  return { ok: true, session: session as AuthSession };
}

export async function requireAnyPermission(
  _req: NextRequest,
  perms: Permission[],
): Promise<AuthzResult> {
  const session = await getAuthSession();
  if (!session) return { ok: false, response: err('Unauthorized', 401, 'UNAUTHORIZED') };
  const role = session.user.role as string;
  if (!perms.some(p => hasPermission(role, p))) {
    logger.warn('[Authz] permission denied (any)', {
      userId: session.user.id, role, required: perms,
    });
    // V007 FIX 5: persist denial to DB
    persistDenial({ userId: session.user.id, role, required: perms, kind: 'permission' });
    return { ok: false, response: err('Forbidden', 403, 'FORBIDDEN') };
  }
  return { ok: true, session: session as AuthSession };
}

// ── Ownership / resource-level guard ──────────────────────────────
export function requireOwnership(
  session: AuthSession,
  resourceUserId: string | undefined | null,
  bypassPermission?: Permission,
): NextResponse | null {
  const role = session.user.role as string;
  if (bypassPermission && hasPermission(role, bypassPermission)) return null;
  if (!resourceUserId) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }
  if (resourceUserId.toString() !== session.user.id) {
    logger.warn('[Authz] cross-user access blocked', {
      actor: session.user.id, target: resourceUserId.toString(),
    });
    // V007 FIX 5: persist ownership denial to DB
    persistDenial({
      actor:    session.user.id,
      target:   resourceUserId.toString(),
      role:     session.user.role as string,
      required: bypassPermission ?? 'ownership',
      kind:     'ownership',
    });
    return err('Forbidden', 403, 'FORBIDDEN');
  }
  return null;
}

// ── Privilege-escalation guard ────────────────────────────────────
export function assertCanAssignRole(
  session: AuthSession,
  targetUserId: string,
  newRole: string,
): NextResponse | null {
  if (!hasPermission(session.user.role as string, 'change:role')) {
    // V007 FIX 5: persist role escalation attempt to DB
    persistDenial({
      userId:   session.user.id,
      role:     session.user.role as string,
      required: 'change:role',
      kind:     'role-escalation',
      target:   targetUserId,
    });
    return err('Forbidden', 403, 'FORBIDDEN');
  }
  if (targetUserId === session.user.id) {
    return err('You cannot change your own role', 400, 'SELF_ROLE_CHANGE');
  }
  if (!ROLE_PERMISSIONS[newRole]) {
    return err('Invalid role', 400, 'INVALID_ROLE');
  }
  // FIX #9 (V031): Prevent privilege escalation to 'admin' by non-admin actors.
  // Even if a future bug granted 'change:role' to a manager/staff, they must
  // not be able to self-elevate to admin or create new admins. Only an existing
  // admin may assign the 'admin' role.
  if (newRole === 'admin' && session.user.role !== 'admin') {
    persistDenial({
      userId:   session.user.id,
      role:     session.user.role as string,
      required: 'admin-assignment',
      kind:     'role-escalation',
      target:   targetUserId,
    });
    return err('Only admins can assign the admin role', 403, 'ADMIN_ESCALATION');
  }
  return null;
}
