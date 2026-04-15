// POST /api/auth/verify-email       — resend verification
// GET  /api/auth/verify-email?token — confirm token
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody } from '@/lib/api';
import { enqueueEmail } from '@/lib/queue';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return err('Token required', 400);
  await connectDB();
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    emailVerificationToken:   hashed,
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpires');
  if (!user) return err('Token is invalid or has expired', 400);
  user.isEmailVerified          = true;
  user.emailVerificationToken   = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  return ok({ message: 'Email verified successfully' });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, session) => {
    await connectDB();
    const user = await User.findById(session!.user.id)
      .select('+emailVerificationToken +emailVerificationExpires');
    if (!user) return err('User not found', 404);
    if (user.isEmailVerified) return err('Email already verified', 400);
    const raw = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken   = crypto.createHash('sha256').update(raw).digest('hex');
    user.emailVerificationExpires = new Date(Date.now() + 24 * 3600000);
    await user.save();
    await enqueueEmail({ type: 'verification', email: user.email, token: raw, name: user.name });
    return ok({ message: 'Verification email sent' });
  });
}, { failClosed: true, rateMax: 5, rateWindow: 3600 });
