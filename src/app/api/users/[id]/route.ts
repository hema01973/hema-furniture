// src/app/api/users/[id]/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB, User } from '@/lib/mongodb';
import { ok, err, withErrorHandler, withAuth, validateBody } from '@/lib/api';

type Ctx = { params: { id: string } };

// GET /api/users/:id
export const GET = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async (_req, session) => {
    await connectDB();
    const id = session!.user.role === 'admin' ? params.id : session!.user.id;
    const user = await User.findById(id).select('-passwordHash -emailVerificationToken -passwordResetToken').lean();
    if (!user) return err('User not found', 404);
    return ok(user);
  });
});

const UpdateSchema = z.object({
  name:  z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  addresses: z.array(z.object({
    label: z.string(), street: z.string(), city: z.string(), governorate: z.string(),
    isDefault: z.boolean().optional(),
  })).optional(),
});

// PUT /api/users/:id
export const PUT = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async (_req, session) => {
    if (session!.user.role !== 'admin' && session!.user.id !== params.id) return err('Forbidden', 403);
    const v = await validateBody(req, UpdateSchema);
    if ('error' in v) return v.error;
    await connectDB();
    const user = await User.findByIdAndUpdate(params.id, v.data, { new: true }).select('-passwordHash');
    if (!user) return err('User not found', 404);
    return ok(user);
  });
});

// PATCH /api/users/:id/block  (admin only)
export const PATCH = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async () => {
    const { action } = await req.json(); // { action: 'block' | 'unblock' }
    await connectDB();
    const user = await User.findByIdAndUpdate(params.id, { isActive: action !== 'block' }, { new: true }).select('-passwordHash');
    if (!user) return err('User not found', 404);
    return ok(user);
  }, ['admin']);
});

// DELETE /api/users/:id  (admin only)
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: unknown) => {
  const { params } = ctx as Ctx;
  return withAuth(req, async () => {
    await connectDB();
    const user = await User.findByIdAndDelete(params.id);
    if (!user) return err('User not found', 404);
    return ok({ message: 'User deleted' });
  }, ['admin']);
});
