// POST /api/auth/reset-password
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';

const Schema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, 'At least 8 characters')
              .regex(/[A-Z]/, 'Must contain uppercase')
              .regex(/[0-9]/, 'Must contain a number'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;
  await connectDB();
  const hashed = crypto.createHash('sha256').update(v.data.token).digest('hex');
  const user = await User.findOne({
    passwordResetToken:   hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordHash +passwordResetToken +passwordResetExpires');
  if (!user) return err('Reset link is invalid or has expired', 400);
  user.passwordHash         = await bcrypt.hash(v.data.password, 12);
  user.passwordResetToken   = undefined;
  user.passwordResetExpires = undefined;
  user.failedLogins         = 0;
  user.lockedUntil          = undefined;
  await user.save();
  return ok({ message: 'Password reset. Please sign in.' });
}, { failClosed: true, rateMax: 10, rateWindow: 900 });
