// src/app/api/auth/reset-password/route.ts — HemaV068
// MED-002 FIX (V068): COMMON_PASSWORDS check added to password reset flow.
//   Previously, a user could reset to a well-known common password like 'Admin123!'
//   that would be rejected at registration. NIST SP 800-63B §5.1.1.2 requires this
//   check at ALL password-setting entry points, not just registration.
// HemaV050: password reuse prevention confirmed (NIST 800-63B, VULN-09)
// V037: verifyPassword check added — new password must differ from current hash
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
// V036 FIX: replaced @node-rs/bcrypt with hashPassword from auth.ts (argon2id)
import { hashPassword, verifyPassword } from '@/lib/auth';

// MED-002 FIX (V068): Shared common-password blocklist (mirrors register/route.ts).
// NIST SP 800-63B §5.1.1.2 requires this check at ALL password-setting entry points.
// Integrate HaveIBeenPwned k-anonymity API for production-grade coverage (LOW-001).
const COMMON_PASSWORDS = new Set([
  'password1', 'password1!', 'password1a', 'Password1', 'Password1!', 'Password1@',
  'qwerty123', 'Qwerty123', 'Qwerty123!', 'abc123456', 'Abc12345!', 'Admin123!',
  'Welcome1!', 'welcome1!', 'Summer2024!', 'Winter2024!', 'Spring2024!', 'Fall2024!',
  'Summer2025!', 'Winter2025!', 'Spring2025!', 'Fall2025!', 'Summer2023!', 'Winter2023!',
  'Hello123!', 'hello123!', 'Test1234!', 'test1234!', 'User1234!', 'user1234!',
  'Admin1234!', 'admin1234!', 'Secret123!', 'secret123!', 'Pass1234!', 'pass1234!',
  'Iloveyou1!', 'iloveyou1!', 'Monkey123!', 'Dragon123!', 'Master123!', 'Pass@word1',
  'P@ssword1', 'P@ssw0rd1', 'P@$$w0rd1', 'Passw0rd!', 'passw0rd!', 'Pa$$word1',
]);

// ── Password policy: MUST match /api/auth/register exactly ────────
// Having weaker rules on reset allows downgrading an account's password
// strength via the reset flow — a subtle but real security regression.
const Schema = z.object({
  token:    z.string().min(1).max(200),
  password: z.string()
              .min(8,  'Password must be at least 8 characters')
              .max(128,'Password must be at most 128 characters')
              .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
              .regex(/[0-9]/, 'Password must contain at least one number')
              .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
              // MED-002 FIX (V068): NIST SP 800-63B §5.1.1.2 — reject known common passwords
              .refine(pwd => !COMMON_PASSWORDS.has(pwd), 'This password is too common. Please choose a more unique password.'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;
  await connectDB();
  const hashed = crypto.createHash('sha256').update(v.data.token).digest('hex');
  const user = await (User.findOne as any)({
    passwordResetToken:   hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordHash +passwordResetToken +passwordResetExpires');
  if (!user) return err('Reset link is invalid or has expired', 400);

  // VULN-09 FIX: NIST SP 800-63B — prevent reuse of current password
  // An attacker who obtains a reset link should not be able to "reset" to the same
  // compromised password, leaving the account vulnerable with no indication of change.
  if (user.passwordHash) {
    const isSamePassword = await verifyPassword(v.data.password, user.passwordHash);
    if (isSamePassword) {
      return err('New password must be different from your current password', 400, 'PASSWORD_REUSE');
    }
  }

  user.passwordHash         = await hashPassword(v.data.password);
  user.passwordResetToken   = undefined;
  user.passwordResetExpires = undefined;
  user.failedLogins         = 0;
  user.lockedUntil          = undefined;
  // V042: clear forced-reset flag — user has now set an argon2id password.
  user.mustResetPassword    = false;
  user.mustResetReason      = '';
  await user.save();
  return ok({ message: 'Password reset. Please sign in.' });
}, { failClosed: true, rateMax: 10, rateWindow: 900 });
