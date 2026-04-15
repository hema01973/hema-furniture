// POST /api/auth/register — hash password + send welcome + verification via queue
import { NextRequest } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { enqueueEmail } from '@/lib/queue';

const RegisterSchema = z.object({
  name:     z.string().min(2).max(100),
  email:    z.string().email(),
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain a number'),
  phone:    z.string().optional(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, RegisterSchema);
  if ('error' in v) return v.error;
  await connectDB();
  const { name, email, password, phone } = v.data;
  if (await User.findOne({ email: email.toLowerCase() })) return err('Email already registered', 409);

  const passwordHash = await hashPassword(password);

  // Email verification token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await User.create({
    name, email: email.toLowerCase(), passwordHash, phone,
    isEmailVerified: false,
    emailVerificationToken:   tokenHash,
    emailVerificationExpires: new Date(Date.now() + 24 * 3600000),
    isActive: true,
  });

  // Queue both emails (non-blocking)
  enqueueEmail({ type: 'welcome',       name, email }).catch(() => {});
  enqueueEmail({ type: 'verification',  email, token: rawToken, name }).catch(() => {});

  return ok({ message: 'Account created. Please check your email to verify.' }, 201);
}, { rateMax: 20, rateWindow: 3600 }); // Max 20 registrations/hour per IP
