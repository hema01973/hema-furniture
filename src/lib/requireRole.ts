// src/lib/requireRole.ts — RETIRED in HemaV069
//
// CRIT-001 + MED-005 FIX (V069): This module has been fully retired.
// All routes previously importing requireRole() have been migrated to
// requirePermission() from lib/authz.ts — the single source of truth for RBAC.
//
// This file now throws at import time to prevent any accidental future use.
// It will be completely removed in HemaV070.

throw new Error(
  '[requireRole] This module is retired. ' +
  'Use requirePermission() from @/lib/authz instead. ' +
  'See FIXES_HemaV069.md for migration details.'
);

export {};
