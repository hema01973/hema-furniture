// GET — generate TOTP secret + QR code  | POST — activate MFA after first verify
import { NextRequest } from 'next/server';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody } from '@/lib/api';

export const GET = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, session) => {
    const secret = speakeasy.generateSecret({ name: `Hema Furniture (${session!.user.email})`, length: 20 });
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url!);
    await connectDB();
    await User.findByIdAndUpdate(session!.user.id, { mfaSecret: secret.base32 });
    return ok({ secret: secret.base32, qrDataUrl });
  });
});

const VerifySchema = z.object({ token: z.string().length(6) });

export const POST = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, session) => {
    const v = await validateBody(req, VerifySchema);
    if ('error' in v) return v.error;
    await connectDB();
    const user = await User.findById(session!.user.id).select('+mfaSecret +mfaBackupCodes');
    if (!user?.mfaSecret) return err('Start setup first', 400);
    const valid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: 'base32', token: v.data.token, window: 1 });
    if (!valid) return err('Invalid code', 400);
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    user.mfaEnabled     = true;
    user.mfaBackupCodes = backupCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));
    await user.save();
    return ok({ activated: true, backupCodes });
  });
});
