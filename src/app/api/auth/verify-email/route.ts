// POST /api/auth/verify-email       — resend verification
// GET  /api/auth/verify-email?token — confirm token
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz'; // V010 (W2)
import { enqueueEmail } from '@/lib/queue';

// V040 FIX [MED-03]: add rate limiting to the GET (token confirmation) handler.
// All other auth-adjacent endpoints already have explicit rate limits; this was
// the only one missing. failClosed: false — a Redis outage must not block a user
// from verifying their email (UX critical path). 10 req / 10 min per IP is
// generous enough for legitimate use (one click + a few retries) while preventing
// timing-based probing and DB flood attacks.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return err('Token required', 400);
  await connectDB();
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await (User.findOne as any)({
    emailVerificationToken:   hashed,
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpires');
  if (!user) return err('Token is invalid or has expired', 400);
  user.isEmailVerified          = true;
  user.emailVerificationToken   = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  return ok({ message: 'Email verified successfully' });
}, { failClosed: false, rateMax: 10, rateWindow: 600 });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'auth:self');
  if (!auth.ok) return auth.response;
  const session = auth.session;

  await connectDB();
  const user = await (User.findById as any)(session.user.id)
    .select('+emailVerificationToken +emailVerificationExpires');
  if (!user) return err('User not found', 404);
  if (user.isEmailVerified) return err('Email already verified', 400);
  const raw = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken   = crypto.createHash('sha256').update(raw).digest('hex');
  user.emailVerificationExpires = new Date(Date.now() + 24 * 3600000);
  await user.save();
  await enqueueEmail({ type: 'verification', email: user.email, token: raw, name: user.name });
  return ok({ message: 'Verification email sent' });
}, { failClosed: true, rateMax: 5, rateWindow: 3600 });
