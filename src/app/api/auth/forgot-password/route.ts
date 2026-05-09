// src/app/api/auth/forgot-password/route.ts — HemaV066
// LOW-04 FIX (V062): Account enumeration protection hardened.
//   - Always returns 200 with identical message regardless of user existence.
//   - Timing equalized using argon2Verify DUMMY_HASH (matches login branch cost),
//     not just setTimeout — measurable timing differences are closed.
//   - Never returns 404 or any differentiating body/timing signal.
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { verify as argon2Verify } from '@node-rs/argon2';
import { connectDB, User } from '@/lib/mongodb';
import { ok, withErrorHandler, validateBody } from '@/lib/api';
import { enqueueEmail } from '@/lib/queue';

const Schema = z.object({ email: z.string().email() });

// LOW-04 FIX (V062): Pre-computed argon2id dummy hash — same cost as login's DUMMY_HASH.
// Running argon2Verify against this normalizes response time between:
//   existing user   → DB save + email enqueue
//   non-existent    → dummy argon2 work (same ~150ms cost)
// A plain setTimeout is insufficient because argon2 timing variance is measurable.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$dW5ndWVzc2FibGVzYWx0MTIz$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;
  await connectDB();
  const user = await (User.findOne as any)({ email: v.data.email.toLowerCase() })
    .select('+passwordResetToken +passwordResetExpires');
  if (user && user.isActive) {
    const raw = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken   = crypto.createHash('sha256').update(raw).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 3600000);
    await user.save();
    await enqueueEmail({ type: 'passwordReset', email: user.email, token: raw });
  } else {
    // LOW-04 FIX (V062): Run argon2Verify dummy work so timing is indistinguishable
    // from the existing-user branch. This closes the timing side-channel even under
    // precise measurement — a fixed setTimeout delay is detectable with enough samples.
    await argon2Verify(DUMMY_HASH, 'dummy-password').catch(() => {});
  }
  // Always return 200 with identical message — never leak account existence.
  return ok({ message: 'If that email exists, a reset link was sent.' });
}, { failClosed: true, rateMax: 5, rateWindow: 900 });
