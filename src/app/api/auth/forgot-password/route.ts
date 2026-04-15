// POST /api/auth/forgot-password — email-enumeration-safe, fail-closed rate limit
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, withErrorHandler, validateBody } from '@/lib/api';
import { enqueueEmail } from '@/lib/queue';

const Schema = z.object({ email: z.string().email() });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;
  await connectDB();
  const user = await User.findOne({ email: v.data.email.toLowerCase() })
    .select('+passwordResetToken +passwordResetExpires');
  if (user && user.isActive) {
    const raw = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken   = crypto.createHash('sha256').update(raw).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 3600000);
    await user.save();
    await enqueueEmail({ type: 'passwordReset', email: user.email, token: raw });
  }
  // Always same response to prevent enumeration
  return ok({ message: 'If that email is registered you will receive a reset link.' });
}, { failClosed: true, rateMax: 5, rateWindow: 900 });
