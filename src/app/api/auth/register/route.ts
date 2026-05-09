// src/app/api/auth/register/route.ts — HemaV071
// MED-05 FIX (V066): Common password check added — NIST SP 800-63B §5.1.1.2 compliance.
//   Passwords matching top common patterns are rejected at registration time.
// HemaV050: sanitized inputs, failClosed rate limit, timing-safe
import { NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { sanitize, sanitizeEmail } from '@/lib/sanitize';
import { enqueueEmail } from '@/lib/queue';
import { logger } from '@/lib/logger';
import { assignDefaultRole } from '@/lib/role.service'; // V055: RBAC default role


// MED-05 FIX (V066): Top common passwords that satisfy complexity rules but are well-known.
// This is a representative set; integrate zxcvbn or HaveIBeenPwned API for production-grade coverage.
// Reference: NIST SP 800-63B §5.1.1.2 — check new passwords against compromised password lists.
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

const RegisterSchema = z.object({
  name:     z.string().min(2).max(100)
             .transform(v => sanitize(v)),
  email:    z.string().email()
             .transform(v => sanitizeEmail(v)),
  password: z.string()
             .min(8,  'Password must be at least 8 characters')
             .max(128,'Password must be at most 128 characters')
             .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
             .regex(/[0-9]/, 'Password must contain at least one number')
             .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
             // MED-05 FIX (V066): reject known common passwords
             .refine(pwd => !COMMON_PASSWORDS.has(pwd), 'This password is too common. Please choose a more unique password.'),
  phone:    z.string().max(20).optional()
             .transform(v => v ? sanitize(v) : undefined),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, RegisterSchema);
  if ('error' in v) return v.error;

  await connectDB();
  const { name, email, password, phone } = v.data;

  // Constant-time existence check to prevent user enumeration
  const existing = await (User.findOne as any)({ email });
  if (existing) {
    // V011: P1-02 — burn an equivalent bcrypt round on the existing-user
    // branch so the response timing distribution matches the create-user
    // branch (both pay one hashPassword cost). Random sleep alone is
    // distinguishable to a remote attacker measuring p50 over many probes.
    await hashPassword(password);
    return ok({ message: 'If this email is new, you will receive a verification email.' }, 201);
  }

  const passwordHash = await hashPassword(password);
  const rawToken     = crypto.randomBytes(32).toString('hex');
  // Store SHA-256 of token — raw token is sent to user, hash stored in DB
  const tokenHash    = crypto.createHash('sha256').update(rawToken).digest('hex');

  const newUser = await (User.create as any)({
    name,
    email,
    passwordHash,
    phone,
    isEmailVerified:          false,
    emailVerificationToken:   tokenHash,
    emailVerificationExpires: new Date(Date.now() + 24 * 3600_000),
    isActive: true,
  });

  // V055: assign default 'user' role — deny-by-default RBAC
  await assignDefaultRole(newUser._id.toString());

  logger.info('[Register] New user created', { email });

  // Non-blocking: queue both emails
  enqueueEmail({ type: 'welcome',      name,  email }).catch(() => {});
  enqueueEmail({ type: 'verification', email, token: rawToken, name }).catch(() => {});

  return ok({ message: 'If this email is new, you will receive a verification email.' }, 201);
}, {
  failClosed: true,    // block registration if Redis is down (prevents spam during outages)
  // HIGH-002 FIX (V071): Stricter rate limit — 5 registrations per 5 minutes per IP.
  // argon2id is CPU-heavy (64MiB, 3 iterations) so even 5 rapid requests can saturate
  // server CPU. Also prevents DB flood with fake accounts. 5/5min is strict enough to
  // stop automated abuse while not blocking legitimate users who rarely register twice.
  rateMax:    5,
  rateWindow: 300,
});
