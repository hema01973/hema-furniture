// POST /api/auth/mfa/verify
import { NextRequest } from 'next/server';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';

const Schema = z.object({ userId: z.string(), token: z.string() });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const v = await validateBody(req, Schema);
  if ('error' in v) return v.error;
  await connectDB();
  const user = await User.findById(v.data.userId).select('+mfaSecret +mfaBackupCodes +failedLogins +lockedUntil');
  if (!user?.mfaEnabled || !user.mfaSecret) return err('MFA not configured', 400);
  if (user.lockedUntil && user.lockedUntil > new Date()) return err('Account locked. Try again later.', 423);

  const validTotp    = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: 'base32', token: v.data.token, window: 1 });
  const hash         = crypto.createHash('sha256').update(v.data.token).digest('hex');
  const backupIdx    = (user.mfaBackupCodes ?? []).indexOf(hash);
  const validBackup  = backupIdx !== -1;

  if (!validTotp && !validBackup) {
    user.failedLogins = (user.failedLogins ?? 0) + 1;
    if (user.failedLogins >= 5) user.lockedUntil = new Date(Date.now() + 15 * 60000);
    await user.save();
    return err('Invalid code', 401);
  }
  if (validBackup) { user.mfaBackupCodes!.splice(backupIdx, 1); }
  user.failedLogins = 0;
  user.lockedUntil  = undefined;
  await user.save();
  return ok({ verified: true });
}, { failClosed: true, rateMax: 10, rateWindow: 300 });
