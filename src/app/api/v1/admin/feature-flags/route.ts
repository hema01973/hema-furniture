// src/app/api/v1/admin/feature-flags/route.ts — HemaV068
// HIGH-003 FIX (V068): POST handler now uses validateBody() instead of req.json() directly.
//   Direct req.json() had no body-size limit — a 50MB+ payload could exhaust edge memory
//   before safeParse() rejected it, enabling DoS via memory exhaustion.
//   validateBody() enforces the 1MB limit and Content-Type: application/json check.
// V063 FIX-MED-03: Rate limit added to both GET and POST — was missing on both.
// HIGH-02 FIX (V054): POST handler now requires 'write:feature-flags' instead of
// 'read:analytics'. Previously, support role (which has read:analytics) could
// modify Feature Flags — now only admin/manager can write flags.
// V063 FIX-MED-03: Rate limit added to both GET and POST — was missing on both.
// HIGH-02 FIX (V054): POST handler now requires 'write:feature-flags' instead of
// 'read:analytics'. Previously, support role (which has read:analytics) could
// modify Feature Flags — now only admin/manager can write flags.

import { NextRequest }                 from 'next/server';
import { ok, err, withErrorHandler, validateBody }   from '@/lib/api';
import { requirePermission }           from '@/lib/authz';
import { getFeatureFlags, setFlag }    from '@/application/feature-flags';
import type { FlagName }               from '@/application/feature-flags';
import { audit }                       from '@/lib/audit';
import { getClientIp }                 from '@/lib/ip';
import { z }                           from 'zod';

// V063 FIX-MED-03: Rate limit added — was missing on GET.
export const GET = withErrorHandler(async (req: NextRequest) => {
  const authz = await requirePermission(req, 'read:analytics');
  if (!authz.ok) return authz.response;
  const flags = await getFeatureFlags();
  return ok({ flags: flags.getAll() });
}, { rateMax: 20, rateWindow: 60 });

const UpdateFlagSchema = z.object({
  flag:  z.string().min(1).max(100),
  value: z.boolean(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // HIGH-02 FIX (V054): use dedicated write:feature-flags permission
  const authz = await requirePermission(req, 'write:feature-flags');
  if (!authz.ok) return authz.response;

  // HIGH-003 FIX (V068): Use project-standard validateBody() which enforces:
  //   1. Content-Type: application/json (prevents CSRF via form submissions)
  //   2. 1MB body-size limit (prevents DoS via memory exhaustion on oversized payloads)
  const v = await validateBody(req, UpdateFlagSchema);
  if ('error' in v) return v.error;
  const { flag, value } = v.data;

  try {
    await setFlag(flag as FlagName, value);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'Could not update flag', 503);
  }

  audit('flag.updated', {
    actorId:    authz.session.user.id,
    resourceId: flag,
    details:    { value },
    ip:         getClientIp(req),
  });

  return ok({ flag, value, updated: true });
// V063 FIX-MED-03: Rate limit added — was missing on POST.
}, { rateMax: 20, rateWindow: 60 });
