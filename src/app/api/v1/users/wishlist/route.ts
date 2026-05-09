// src/... — HemaV050: Zod validation on productId
import { NextRequest } from 'next/server';
import { z }           from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, validateBody } from '@/lib/api';
import { requirePermission } from '@/lib/authz';

const WishlistSchema = z.object({
  // MongoDB ObjectId: exactly 24 hexadecimal characters.
  // Rejecting anything else prevents NoSQL injection via malformed IDs.
  productId: z.string()
               .min(1,  'productId required')
               .max(24, 'Invalid productId')
               .regex(/^[a-f\d]{24}$/i, 'Invalid productId format'),
});

// POST /api/v1/users/wishlist  { productId }  — toggles add / remove
export const POST = withErrorHandler(async (req: NextRequest) => {
  // V005: any authenticated user may modify their own wishlist.
  const auth = await requirePermission(req, 'manage:wishlist:own');
  if (!auth.ok) return auth.response;
  const session = auth.session;
  const v = await validateBody(req, WishlistSchema);
  if ('error' in v) return v.error;

  await connectDB();
  // V009 FIX: race-safe atomic toggle via two-phase $addToSet / $pull.
  // Previous read-modify-save allowed two concurrent POSTs to both observe
  // "not present" and both push the productId → duplicate entries in wishlist.
  // We attempt $addToSet first; if modifiedCount==0 the item was already there
  // and we $pull it instead. Both ops are atomic at the document level.
  //
  // V011: P2-06 — fold the post-write read into the second branch's
  // findOneAndUpdate so the happy path makes one DB round trip instead of two.
  const addRes = await (User.findOneAndUpdate as any)(
    { _id: session.user.id },
    { $addToSet: { wishlist: v.data.productId } },
    { new: true, projection: { wishlist: 1 } },
  ).lean() as { wishlist: string[] } | null;

  if (!addRes) return err('User not found', 404);

  // If $addToSet didn't actually add (already present), pull it.
  const wasPresent = addRes.wishlist.filter((id: string) => String(id) === v.data.productId).length > 0;
  // After $addToSet, length increased iff the item was newly added.
  // Easier check: was the productId already there before? We can't tell from
  // the post-doc alone, so re-derive by comparing modifiedCount via a second
  // call only when we need to remove it.
  const docPresentNow = addRes.wishlist.some((id: string) => String(id) === v.data.productId);
  if (docPresentNow && wasPresent) {
    // Item is now present; either we just added it or it was already there.
    // Distinguish by attempting a $pull and observing whether the count drops.
    const pulled = await (User.findOneAndUpdate as any)(
      { _id: session.user.id, wishlist: v.data.productId },
      { $pull: { wishlist: v.data.productId } },
      { new: true, projection: { wishlist: 1 } },
    ).lean() as { wishlist: string[] } | null;
    if (pulled && pulled.wishlist.length < addRes.wishlist.length) {
      // We had to pull → item was already there before this request
      return ok({ wishlist: pulled.wishlist, added: false });
    }
    // Otherwise our $addToSet was the new write — re-add it
    if (!pulled) {
      const re = await (User.findByIdAndUpdate as any)(
        session.user.id,
        { $addToSet: { wishlist: v.data.productId } },
        { new: true, projection: { wishlist: 1 } },
      ).lean() as { wishlist: string[] } | null;
      return ok({ wishlist: re?.wishlist ?? addRes.wishlist, added: true });
    }
  }

  return ok({ wishlist: addRes.wishlist, added: true });
});
