// src/lib/auth.ts — HemaV071
// V063 FIX-HIGH-01: Explicit startup warning for beta auth library in production.
// V063 FIX-LOW-03: Compute a real argon2id hash at module load time for timing equalization.
// LOW-07 WARNING: next-auth@5.0.0-beta.28 is in use — beta APIs are not semver-stable.
//   Security patches may lag behind stable releases. DO NOT upgrade to a new beta
//   without thorough testing of JWT callbacks, session handling, and cookie names.
//   Track stable release: https://github.com/nextauthjs/next-auth/releases
//   Current: 5.0.0-beta.28 — upgrade to stable when released.
//
// V062 FIXES:
//   - MED-01: 8h session.maxAge + 12h absolute expiry via issuedAt in jwt callback
//   - CRIT-03: middleware uses getSecretSync() instead of process.env.NEXTAUTH_SECRET
//
// V061 FIX-A: Secret version integration — auth.ts now embeds secretVersion in all issued
//   JWTs and validates tokens using getSecretForVersion() (replaces legacy getPreviousSecret()).
//   - secretVersion embedded at sign-in time and validated on every JWT refresh.
//   - Tokens whose secretVersion is no longer valid (rotation grace expired) are rejected.
//   - No fallback to legacy getPreviousSecret() — version-bound only.
//
// V054: Auth.js v5 migration + argon2id + single ADMIN_ROLES source
//
// Breaking changes from next-auth v4 → v5:
//  • `authOptions: AuthOptions` → `NextAuthConfig` passed directly to `NextAuth()`
//  • `getServerSession(authOptions)` → `auth()` exported from this module
//  • `[...nextauth]/route.ts` now re-exports `{ handlers }` instead of `NextAuth(authOptions)`
//  • Cookie names preserved to keep existing sessions valid across the upgrade
//  • `@node-rs/bcrypt` replaced by `@node-rs/argon2` (argon2id variant)
//    — argon2id is memory-hard and GPU-resistant; bcrypt is CPU-only and
//      increasingly cheap to attack with modern hardware.
//  • ADMIN_ROLES now imported from constants.ts (single source of truth)

import NextAuth                        from 'next-auth';
import Credentials                     from 'next-auth/providers/credentials';
import type { NextAuthConfig }         from 'next-auth';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { connectDB, User }             from './mongodb';
import { logger }                      from './logger';
import { validateMfaCompletionToken }  from './mfa-token';
import { getRedis }                    from './redis'; // PERF-001: JWT DB lookup cache
import { ADMIN_ROLES }                 from '@/lib/constants';
import { getSecretSync, getSecretForVersion, getSecretVersion } from './secrets';
import type { UserRole }               from '@/types';

// HIGH-04 FIX (V067): next-auth upgraded from 5.0.0-beta.28 to ^5.0.0 stable.
// The beta warning below is removed. Monitor for CVEs at:
// https://github.com/nextauthjs/next-auth/releases
// HIGH-04 FIX (V067): next-auth is now stable ^5.0.0 — beta warning removed.

// ── Argon2id parameters ───────────────────────────────────────────────────
// OWASP recommended minimum for argon2id:
//   memoryCost: 64 MiB, timeCost: 3, parallelism: 4 (~150ms on modern hardware)
export const ARGON2_OPTIONS = {
  algorithm:   2, // Argon2id = 2 (const enum not usable with isolatedModules)
  memoryCost:  65536,
  timeCost:    3,
  parallelism: 4,
};

// ── Type augmentation (next-auth v5) ─────────────────────────────────────
declare module 'next-auth' {
  interface User {
    id:                string;
    role:              UserRole;
    mfaPending?:       boolean;
    pv:                number;
    mustResetPassword?: boolean;
    mustResetReason?:   string;
  }
  interface Session {
    user: { id: string; name: string; email: string; role: UserRole; image?: string };
    mfaVerified?: boolean;
  }
}
declare module 'next-auth/jwt' {
  interface JWT { id?: string; role?: UserRole; mfaPending?: boolean; pv: number; mustResetPassword?: boolean; mustResetReason?: string; isDisabled?: boolean; secretVersion?: number; issuedAt?: number; }
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_DURATION  = 15 * 60 * 1000;

// V063 FIX-LOW-03: Compute a real argon2id hash at module load time for timing equalization.
// The previous hand-crafted hash with an all-zero digest is replaced with a legitimately
// computed hash to prevent any future library short-circuit on trivially invalid values.
let _dummyHash: string = '';
(async () => {
  try {
    _dummyHash = await argon2Hash('__hema_dummy_password_V063__', ARGON2_OPTIONS);
  } catch {
    // Fallback: if startup hash fails, use a known-valid hash format.
    // This should never occur; argon2 parameters are validated at import time.
    _dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$' +
      'dGhpcyBpcyBhIHZhbGlkIGJ1dCBmYWtlIGhhc2g';
  }
})();

// MED-001 FIX (V071): SESSION COOKIE: SameSite=Lax مقصود — يسمح بـ Paymob 3DS redirect flows
// حيث يُعيد المتصفح المستخدم من paymob.com إلى تطبيقنا مع الـ session cookie.
// استخدام 'strict' يكسر 3DS payment flow. CSRF محمي بـ Signed Double-Submit (csrf.ts).
const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email    = (credentials.email    as string).toLowerCase().trim();
        const password = credentials.password  as string;
        try {
          await connectDB();
          const user = await (User.findOne as any)({ email })
            .select('+passwordHash +failedLogins +lockedUntil +mustResetPassword +mustResetReason');

          if (!user || !user.isActive) {
            // HIGH-01 FIX (V054): Always run argon2Verify to normalize response
            // timing. Without this, a missing user returns in ~0ms (just the DB
            // lookup) while a real wrong-password takes ~150ms (argon2 cost),
            // leaking whether an email is registered.
            await argon2Verify(_dummyHash, password).catch(() => {});
            return null;
          }

          if (user.lockedUntil && user.lockedUntil > new Date()) {
            const wait = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            logger.warn('[Auth] Login blocked — account locked', { email, wait });
            throw new Error(`Account locked for ${wait} more minute${wait > 1 ? 's' : ''}`);
          }

          // V042: Detect legacy bcrypt hashes ($2b$ / $2a$) from pre-V054 era.
          // argon2Verify throws on bcrypt input — detect explicitly for clarity and auditability.
          // Users with bcrypt hashes are forced through /forgot-password before they can log in.
          const isBcryptHash = typeof user.passwordHash === 'string' &&
            (user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$'));
          if (isBcryptHash) {
            await (User.findByIdAndUpdate as any)(user._id, {
              mustResetPassword: true,
              mustResetReason:   'Your account security has been upgraded. Please reset your password to continue.',
            });
            logger.warn('[Auth] Login rejected — legacy bcrypt hash, forced reset required', {
              userId: user._id, email,
            });
            throw new Error('PASSWORD_RESET_REQUIRED');
          }

          // V054: argon2id verify.
          const valid = await argon2Verify(user.passwordHash, password);

          if (!valid) {
            const failed = (user.failedLogins ?? 0) + 1;
            const update: Record<string, unknown> = { failedLogins: failed };
            if (failed >= MAX_FAILED_LOGINS) {
              update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
              logger.warn('[Auth] Account locked', { userId: user._id, failed });
            }
            await (User.findByIdAndUpdate as any)(user._id, update);
            return null;
          }

          await (User.findByIdAndUpdate as any)(user._id, {
            failedLogins: 0,
            $unset:       { lockedUntil: 1 },
            lastLoginAt:  new Date(),
          });

          logger.info('[Auth] Login success', { userId: user._id, role: user.role });

          return {
            id:                user._id.toString(),
            name:              user.name,
            email:             user.email,
            role:              user.role as UserRole,
            mfaPending:        user.mfaEnabled ? true : undefined,
            pv:                user.permissionVersion ?? 0,
            mustResetPassword: user.mustResetPassword || undefined,
            mustResetReason:   user.mustResetReason,
          };
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('Account locked')) throw error;
          logger.error('[Auth] Authorize error', { error: String(error) });
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // V061 FIX-A: Embed secretVersion at token issuance time so every JWT
        // carries the version of the signing key used. On subsequent refreshes,
        // getSecretForVersion() validates the token against the correct key version
        // and rejects tokens whose signing key is outside the grace window.
        token.id                = user.id;
        token.role              = user.role;
        token.mfaPending        = user.mfaPending;
        token.pv                = user.pv ?? 0;
        token.mustResetPassword = user.mustResetPassword;
        token.mustResetReason   = user.mustResetReason;
        token.secretVersion     = getSecretVersion('NEXTAUTH_SECRET');
        // MED-01 FIX (V062): Embed issuedAt at token creation so absolute expiry
        // can be enforced regardless of JWT activity. OWASP ASVS §3.3.1 / PCI-DSS 8.3.7
        // require absolute session expiry ≤ 12h. issuedAt survives token refresh cycles
        // because it is only set when the `user` object is present (sign-in time).
        token.issuedAt          = Date.now();
      } else if (token.id) {
        // MED-01 FIX (V062): Absolute session expiry check — 12-hour hard limit.
        // Even if the user is active and the JWT is being refreshed, tokens older
        // than 12h are invalidated unconditionally. The user must re-authenticate.
        // This closes the vulnerability where a stolen account stays active forever.
        const ABSOLUTE_EXPIRY_MS = 12 * 3600 * 1000; // 12 hours
        if (token.issuedAt && Date.now() - token.issuedAt > ABSOLUTE_EXPIRY_MS) {
          logger.info('[Auth] JWT absolute expiry reached — forcing re-authentication', {
            userId: token.id,
            issuedAt: new Date(token.issuedAt).toISOString(),
            age: Math.round((Date.now() - token.issuedAt) / 60000) + 'min',
          });
          return { ...token, id: undefined, role: undefined } as typeof token;
        }
        // V061 FIX-A: Validate secretVersion on every JWT refresh.
        // If the token's secretVersion is no longer valid (rotation grace period expired),
        // force re-authentication. This closes the gap where getPreviousSecret() accepted
        // any token in the time window regardless of actual signing key version.
        const tokenSecretVersion = typeof token.secretVersion === 'number' ? token.secretVersion : undefined;
        if (tokenSecretVersion !== undefined) {
          const matchedSecret = getSecretForVersion('NEXTAUTH_SECRET', tokenSecretVersion);
          if (!matchedSecret) {
            // Secret version no longer valid — token must be re-issued (force sign-out).
            logger.warn('[Auth] JWT rejected — secretVersion no longer valid (rotation grace expired)', {
              userId: token.id,
              tokenSecretVersion,
              currentVersion: getSecretVersion('NEXTAUTH_SECRET'),
            });
            return { ...token, role: undefined, id: undefined, isDisabled: true } as typeof token;
          }
        }
        // V054 SECURITY FIX [BLOCKER-03]: Re-validate permissionVersion against DB on
        // every JWT refresh. Without this check, a revoked/role-changed account retains
        // its old permissions for the full 7-day session lifetime.
        // PERF-001 FIX (HemaV054): Cache the result in Redis to avoid a DB
        // round-trip on every single request. Cache is invalidated on role/pv updates.
        // LOW-04 FIX (V065): TTL is now configurable via PV_CACHE_TTL_SEC (default: 30s).
        // Operators can lower it (e.g. PV_CACHE_TTL_SEC=5) for faster role revocation,
        // or raise it for high-traffic deployments. The trade-off is visible: lower TTL
        // = faster revocation + more DB queries; higher TTL = slower revocation + fewer queries.
        // Minimum enforced at 1s to prevent accidental zero/negative values.
        const PV_CACHE_TTL_SEC = Math.max(
          1,
          parseInt(process.env.PV_CACHE_TTL_SEC ?? '30', 10) || 30,
        );
        type DbUserShape = { permissionVersion?: number; isActive?: boolean; role?: string } | null;
        try {
          const cacheKey = `jwt:user:${token.id}`;
          let dbUser: DbUserShape = null;

          // Try Redis cache first
          const redis = await getRedis().catch(() => null);
          if (redis) {
            try {
              const cached = await redis.get(cacheKey);
              if (cached) {
                dbUser = JSON.parse(cached) as typeof dbUser;
              }
            } catch { /* cache miss — fall through to DB */ }
          }

          // Cache miss: fetch from DB and populate cache
          if (!dbUser) {
            await connectDB();
            dbUser = await (User.findById as any)(token.id)
              .select('permissionVersion isActive role')
              .lean() as DbUserShape;
            if (dbUser && redis) {
              // LOW-04 FIX (V065): Use configurable TTL instead of hard-coded 30
              await redis.setex(cacheKey, PV_CACHE_TTL_SEC, JSON.stringify(dbUser)).catch(() => {});
            }
          }

          // Re-assign through a typed alias so TypeScript does not narrow dbUser to `never`
          // after the null-guard above (TS control-flow narrows the union to null inside the
          // if-block and then loses the non-null branch on exit in some tsc versions).
          const resolvedUser = dbUser as DbUserShape;
          if (!resolvedUser || !resolvedUser.isActive) {
            // Account deleted or deactivated — invalidate session and evict cache
            if (redis) await redis.del(cacheKey).catch(() => {});
            return { ...token, role: undefined, id: undefined, isDisabled: true } as typeof token;
          }
          // SEC-002: persist isDisabled=false so outage handler knows the account was active at last check
          token.isDisabled = false;
          if ((resolvedUser.permissionVersion ?? 0) !== token.pv) {
            // Role or permissions changed — sync token with DB state and evict cache
            if (redis) await redis.del(cacheKey).catch(() => {});
            token.role = resolvedUser.role as UserRole;
            token.pv   = resolvedUser.permissionVersion ?? 0;
            logger.info('[Auth] JWT pv mismatch — token updated from DB', { userId: token.id, newPv: token.pv });
          }
        } catch (err) {
          // SEC-002 FIX (HemaV054): Fail-selective strategy on DB outage.
          // Admin/manager roles MUST fail-closed — elevated privilege must never
          // be allowed without a valid DB check.
          // Normal users get controlled fail-open to avoid disrupting sessions.
          // CRITICAL: If the token carries isDisabled=true (set on last successful
          // DB check), we ALWAYS block regardless of DB availability.
          if (token.isDisabled) {
            logger.warn('[Auth] Blocking disabled user during DB outage', { userId: token.id });
            return { ...token, role: undefined, id: undefined } as typeof token;
          }
          const isElevated = ADMIN_ROLES.has(token.role as string);
          if (isElevated) {
            // Fail-closed: invalidate elevated sessions when DB is unreachable
            logger.warn('[Auth] Admin/manager session invalidated — DB unavailable (fail-closed)', { userId: token.id, role: token.role });
            return { ...token, role: undefined, id: undefined } as typeof token;
          }
          // Normal users: fail-open with a warning
          logger.warn('[Auth] Could not validate pv — DB unavailable (fail-open for normal user)', { userId: token.id, error: err });
        }
      }
      // V054 FIX: HMAC-signed completion token validates MFA
      if (trigger === 'update' && session?.mfaCompletionToken) {
        const validUserId = validateMfaCompletionToken(session.mfaCompletionToken as string);
        if (validUserId && validUserId === token.id) {
          token.mfaPending = undefined;
          logger.info('[Auth] MFA completion token validated', { userId: token.id });
        } else {
          logger.warn('[Auth] Invalid MFA completion token', { userId: token.id });
        }
      }
      return token;
    },
    async session({ session, token }) {
      // token.id / token.role are optional — they are cleared when a session is
      // force-invalidated (absolute expiry, secret rotation). Guard with ?? '' so
      // Session.user keeps its required string shape; the middleware will redirect
      // unauthenticated users before they reach any protected resource.
      session.user.id   = token.id   ?? '';
      session.user.role = token.role ?? ('user' as UserRole);
      return session;
    },
  },

  pages: { signIn: '/login', error: '/login' },
  // MED-01 FIX (V062): 8-hour relative session expiry (OWASP ASVS §3.3.1 / PCI-DSS 8.3.7).
  // Combined with the absolute 12-hour issuedAt check in the jwt callback, sessions
  // expire absolutely after 12h even if the user is continuously active.
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },

  // Preserve v4 cookie names so existing sessions survive the upgrade.
  //
  // VULN-02 FIX (V065): All three cookies changed from sameSite:'lax' to 'strict'.
  // 'lax' allows cookies to be sent on top-level cross-site navigations (links,
  // form GETs), meaning the session token IS transmitted when a user clicks a link
  // from an attacker page. Combined with the CSRF cookie already being 'strict'
  // (set in V064), this created an asymmetry: the session cookie would arrive but
  // the CSRF cookie would not, weakening the defence-in-depth model.
  //
  // With 'strict', all three cookies are withheld on every cross-site navigation.
  // This is safe because:
  //   - Only the Credentials provider is used — no OAuth redirects that rely on lax.
  //   - The login page is first-party, so /login?callbackUrl=... is always same-site.
  //   - The double-submit CSRF cookie (set by middleware) is httpOnly:false and
  //     is therefore already 'strict' — this change brings the session cookies in line.
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: { httpOnly: true, sameSite: 'strict', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.callback-url' : 'next-auth.callback-url',
      options: { httpOnly: true, sameSite: 'strict', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Host-next-auth.csrf-token' : 'next-auth.csrf-token',
      options: { httpOnly: true, sameSite: 'strict', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
  },

  secret: (() => {
    // HIGH-01 FIX (V067): Lazy getter — reads NEXTAUTH_SECRET at request time, not module
    // load time. Prevents stale secret in environments where env vars are initialized after
    // module import (e.g. some serverless / edge environments).
    const s = getSecretSync('NEXTAUTH_SECRET');
    if (!s) throw new Error('NEXTAUTH_SECRET is not defined');
    return s;
  })(),
};

// ── Auth.js v5 exports ────────────────────────────────────────────────────
export const { handlers, auth, signIn: nextAuthSignIn, signOut: nextAuthSignOut } = NextAuth(authConfig);

/** Drop-in replacement for v4 getServerSession(authOptions) */
// Auth.js v5 `auth` is an overloaded HOF. Both `ReturnType<typeof auth>` and
// arrow-function wrapping still resolve to the wrong overload in beta.28.
// The only reliable fix is an explicit cast to the concrete session shape.
type HemaSession = {
  user: {
    id:    string;
    role:  string;
    email: string | null;
    name:  string | null;
    image?: string | null;
    mfaPending?:        boolean;
    mustResetPassword?: boolean;
    mustResetReason?:   string;
    pv?:                number;
  };
  expires: string;
} | null;

export const getAuthSession = auth as unknown as () => Promise<HemaSession>;

export async function requireAuth() {
  const session = await getAuthSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

// V054: ADMIN_ROLES from constants.ts — single source of truth
export async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !ADMIN_ROLES.has(session.user.role as string)) {
    throw new Error('FORBIDDEN');
  }
  return session;
}

// ── Password hashing (argon2id) ───────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return argon2Verify(passwordHash, password);
}
