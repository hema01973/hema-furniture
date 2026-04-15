// src/app/api/users/route.ts
import { NextRequest } from 'next/server';
import { connectDB, User } from '@/lib/mongodb';
import { ok, withErrorHandler, withAuth, getPagination } from '@/lib/api';

// GET /api/users  (admin/staff only)
export const GET = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async () => {
    await connectDB();
    const { page, limit, skip } = getPagination(req);
    const url  = new URL(req.url);
    const role = url.searchParams.get('role');
    const q    = url.searchParams.get('q');

    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (q)    filter.$or  = [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }];

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash -emailVerificationToken -passwordResetToken')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return ok({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }, ['admin', 'staff']);
});
