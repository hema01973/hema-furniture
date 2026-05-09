// src/... — HemaV066: permission-based access
import { NextRequest } from 'next/server';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler } from '@/lib/api';
import { requirePermission } from '@/lib/authz';

// GET /api/v1/users/wishlist/sync — returns DB wishlist IDs for the logged-in user
export const GET = withErrorHandler(async (req: NextRequest) => {
  const auth = await requirePermission(req, 'manage:wishlist:own');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  await connectDB();
  const user = await (User.findById as any)(session.user.id).select('wishlist').lean() as { wishlist?: unknown[] } | null;
  if (!user) return err('User not found', 404);
  const wishlist = (user.wishlist ?? []).map(id => id?.toString());
  return ok({ wishlist });
}, { rateMax: 30, rateWindow: 60 }); // CRIT-03 FIX (V064)
