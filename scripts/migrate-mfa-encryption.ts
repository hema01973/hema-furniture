#!/usr/bin/env tsx
// scripts/migrate-mfa-encryption.ts — HemaV054
// LOW-04 MIGRATION: Encrypt all existing plaintext mfaSecrets in MongoDB.
//
// ── WHAT THIS DOES ────────────────────────────────────────────────────────────
// After deploying LOW-04 fix (V054), existing users still have plaintext
// mfaSecrets in the database. This script finds all such records and
// re-encrypts them using the AES-256-GCM encryption from mfa-encryption.ts.
//
// New writes (from mfa/setup/route.ts) are already encrypted.
// This script handles the one-time migration of historical data.
//
// ── SAFETY ────────────────────────────────────────────────────────────────────
// • Dry-run mode by default — add --execute to actually write changes.
// • Processes in batches of 100 to avoid memory and lock pressure.
// • Idempotent: already-encrypted values (prefix "enc:") are skipped.
// • Logs every change so you can audit the migration run.
//
// ── PREREQUISITES ─────────────────────────────────────────────────────────────
// 1. MFA_ENCRYPTION_KEY must be set in the environment (or AWS Secrets Manager).
// 2. MONGODB_URI must be set.
// 3. The application must already be deployed with V054 code.
//
// ── USAGE ─────────────────────────────────────────────────────────────────────
//   # Dry run (no writes):
//   MFA_ENCRYPTION_KEY=<hex> MONGODB_URI=<uri> npx tsx scripts/migrate-mfa-encryption.ts
//
//   # Execute (writes to DB):
//   MFA_ENCRYPTION_KEY=<hex> MONGODB_URI=<uri> npx tsx scripts/migrate-mfa-encryption.ts --execute
//
//   # Generate a key if you don't have one:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import mongoose from 'mongoose';
import { encryptMfaSecret, isMfaSecretEncrypted } from '../src/lib/mfa-encryption';

const DRY_RUN   = !process.argv.includes('--execute');
const BATCH_SIZE = 100;

// Minimal inline schema — avoids pulling in the full mongodb.ts bundle
const UserSchema = new mongoose.Schema({
  mfaSecret:  { type: String, select: false },
  mfaEnabled: { type: Boolean, default: false },
}, { collection: 'users' });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function run(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('[migrate-mfa] ERROR: MONGODB_URI is not set');
    process.exit(1);
  }
  if (!process.env.MFA_ENCRYPTION_KEY) {
    console.error('[migrate-mfa] ERROR: MFA_ENCRYPTION_KEY is not set');
    process.exit(1);
  }

  console.log(`[migrate-mfa] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE (will write to DB)'}`);
  console.log('[migrate-mfa] Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('[migrate-mfa] Connected.');

  let processed = 0;
  let encrypted = 0;
  let skipped   = 0;
  let errors    = 0;
  let page      = 0;

  // Only process users who have MFA enabled (have a mfaSecret)
  const total = await User.countDocuments({ mfaEnabled: true });
  console.log(`[migrate-mfa] Found ${total} MFA-enabled users to process.`);

  while (true) {
    const users = (await (User.find as any)({ mfaEnabled: true })
      .select('+mfaSecret')
      .skip(page * BATCH_SIZE)
      .limit(BATCH_SIZE)
      .lean()) as Array<{ _id: mongoose.Types.ObjectId; mfaSecret?: string }>;

    if (users.length === 0) break;

    for (const user of users) {
      processed++;
      const id = user._id.toString();

      if (!user.mfaSecret) {
        console.log(`[migrate-mfa] SKIP ${id} — no mfaSecret`);
        skipped++;
        continue;
      }

      if (isMfaSecretEncrypted(user.mfaSecret)) {
        console.log(`[migrate-mfa] SKIP ${id} — already encrypted`);
        skipped++;
        continue;
      }

      try {
        const encryptedSecret = encryptMfaSecret(user.mfaSecret);

        if (DRY_RUN) {
          console.log(`[migrate-mfa] DRY RUN — would encrypt user ${id} (plaintext length: ${user.mfaSecret.length})`);
        } else {
          await User.updateOne({ _id: user._id }, { $set: { mfaSecret: encryptedSecret } });
          console.log(`[migrate-mfa] ENCRYPTED user ${id}`);
        }
        encrypted++;
      } catch (e) {
        console.error(`[migrate-mfa] ERROR encrypting user ${id}:`, e);
        errors++;
      }
    }

    page++;
    console.log(`[migrate-mfa] Batch ${page} done — processed ${processed}/${total}`);
  }

  console.log('\n[migrate-mfa] ─── Summary ───────────────────────────────');
  console.log(`  Total processed : ${processed}`);
  console.log(`  Encrypted       : ${encrypted} ${DRY_RUN ? '(dry run — no actual writes)' : ''}`);
  console.log(`  Skipped         : ${skipped}`);
  console.log(`  Errors          : ${errors}`);
  console.log('[migrate-mfa] ────────────────────────────────────────────');

  if (errors > 0) {
    console.error('[migrate-mfa] COMPLETED WITH ERRORS — review output above');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[migrate-mfa] Dry run complete. Run with --execute to apply changes.');
  } else {
    console.log('[migrate-mfa] Migration complete.');
  }

  await mongoose.disconnect();
}

run().catch((e: unknown) => {
  console.error('[migrate-mfa] Fatal error:', e);
  process.exit(1);
});
