// src/app/api/users/wishlist/route.ts
import { NextRequest } from 'next/server';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth } from '@/lib/api';

// POST /api/users/wishlist  { productId }
export const POST = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async (_req, session) => {
    const { productId } = await req.json();
    if (!productId) return err('productId required', 400);
    await connectDB();
    const user = await User.findById(session!.user.id);
    if (!user) return err('User not found', 404);
    const idx = user.wishlist.indexOf(productId);
    if (idx > -1) user.wishlist.splice(idx, 1);
    else          user.wishlist.push(productId);
    await user.save();
    return ok({ wishlist: user.wishlist, added: idx === -1 });
  });
});
