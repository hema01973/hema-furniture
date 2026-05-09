// src/app/api/auth/mfa/setup/route.ts — HemaV054
// LOW-04 FIX (V054): mfaSecret is now encrypted at rest using AES-256-GCM
// via encryptMfaSecret() / decryptMfaSecret() from lib/mfa-encryption.ts.
// V039 SECURITY FIX [HIGH-01]: replaced @node-rs/bcrypt with argon2id via hashPassword().
// V009 FIX: prevents re-activation overwriting existing backup codes.
import { NextRequest } from 'next/server';
import { authenticator } from 'otplib';
import { hashPassword } from '@/lib/auth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz';
import { encryptMfaSecret, decryptMfaSecret } from '@/lib/mfa-encryption';

authenticator.options = { digits: 6, step: 30, window: 0 }; // VULN-003 FIX (V068): strict window — current step only. Eliminates the default ±1 step (90s) window.

export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'auth:self');
  if (!auth.ok) return auth.response;
  const session = auth.session;

  await connectDB();
  const existing = await (User.findById as any)(session.user.id).select('mfaEnabled');
  if (existing?.mfaEnabled) {
    return err('MFA is already enabled. Disable it first to re-setup.', 409, 'MFA_ALREADY_ENABLED');
  }

  const secret     = authenticator.generateSecret(32);
  const otpauthUrl = authenticator.keyuri(session.user.email ?? session.user.id, 'Hema Furniture', secret);
  const qrDataUrl  = await QRCode.toDataURL(otpauthUrl);

  // LOW-04 FIX (V054): encrypt mfaSecret before storing in MongoDB
  const encryptedSecret = encryptMfaSecret(secret);
  await (User.findByIdAndUpdate as any)(session.user.id, { mfaSecret: encryptedSecret });

  return ok({ secret, qrDataUrl });
});

const VerifySchema = z.object({
  token: z.string().length(6).regex(/^[0-9]{6}$/, 'TOTP token must be 6 digits'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'auth:self');
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const v = await validateBody(req, VerifySchema);
  if ('error' in v) return v.error;
  await connectDB();

  const user = await (User.findById as any)(session.user.id).select('+mfaSecret +mfaBackupCodes');
  if (!user?.mfaSecret) return err('Start setup first (GET /api/auth/mfa/setup)', 400);
  if (user.mfaEnabled) return err('MFA already enabled', 409, 'MFA_ALREADY_ENABLED');

  // LOW-04 FIX (V054): decrypt before passing to otplib
  const plainSecret = decryptMfaSecret(user.mfaSecret);
  const valid = authenticator.verify({ token: v.data.token, secret: plainSecret });
  if (!valid) return err('Invalid TOTP code', 400);

  const rawCodes    = Array.from({ length: 8 }, () => crypto.randomBytes(6).toString('hex'));
  const hashedCodes = await Promise.all(rawCodes.map(c => hashPassword(c)));

  user.mfaEnabled     = true;
  user.mfaBackupCodes = hashedCodes;
  await user.save();

  return ok({ activated: true, backupCodes: rawCodes });
});
