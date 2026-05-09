// src/types/next-auth.d.ts — HemaV050
// Module augmentation for next-auth/jwt — eliminates (token as any) casts in middleware.ts

import type { UserRole } from '@/types';

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;      // optional — set to undefined to invalidate session (e.g. absolute expiry, secret rotation)
    role?: UserRole;  // optional — cleared alongside id on forced sign-out
    mfaPending?: boolean;
    mustResetPassword?: boolean;
    mustResetReason?: string;
    pv: number;
  }
}
