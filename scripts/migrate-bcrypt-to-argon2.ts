#!/usr/bin/env tsx
/**
 * scripts/migrate-bcrypt-to-argon2.ts — V042
 *
 * Bcrypt → Argon2id migration script.
 *
 * What it does:
 *   1. Connects to MongoDB.
 *   2. Finds all users whose passwordHash starts with "$2b$" or "$2a$" (bcrypt).
 *   3. Sets mustResetPassword=true and mustResetReason on each affected user.
 *   4. Generates a time-limited password-reset token for each user.
 *   5. Enqueues a "passwordReset" email so each user receives a reset link.
 *
 * The users cannot log in until they complete the reset flow.
 * Once they set a new password the reset route clears mustResetPassword.
 *
 * Run ONCE after deploying V042:
 *   npm run migrate:bcrypt
 *   — or —
 *   npx tsx scripts/migrate-bcrypt-to-argon2.ts
 *
 * Dry-run (no DB writes, no emails):
 *   DRY_RUN=true npx tsx scripts/migrate-bcrypt-to-argon2.ts
 *
 * Safety guarantees:
 *   - Idempotent: already-flagged users (mustResetPassword=true) are skipped.
 *   - Dry-run mode prints affected users without touching the DB.
 *   - Batch size is 50 to avoid overwhelming SMTP queue.
 *   - Script fails loudly if MONGODB_URI is missing.
 */

import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';

const DRY_RUN   = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 50;

// ── Inline minimal models to avoid importing the full app stack ──────────────
const UserSchema = new mongoose.Schema({
  email:              { type: String },
  name:               { type: String },
  passwordHash:       { type: String, select: false },
  mustResetPassword:  { type: Boolean, default: false },
  mustResetReason:    { type: String, default: '' },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  isActive:           { type: Boolean, default: true },
}, { collection: 'users', timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function run() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI is not set. Aborting.');
    process.exit(1);
  }

  console.log('🔗  Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log('✅  Connected.');

  if (DRY_RUN) console.log('ℹ️   DRY RUN mode — no writes or emails will be sent.\n');

  // Find users with bcrypt hashes that have NOT yet been flagged
  const bcryptUsers = (await (User.find as any)({
    mustResetPassword: { $ne: true },
    $or: [
      { passwordHash: { $regex: /^\$2b\$/ } },
      { passwordHash: { $regex: /^\$2a\$/ } },
    ],
    isActive: true,
  }).select('+passwordHash +passwordResetToken').lean()) as Array<{
    _id: mongoose.Types.ObjectId;
    email: string;
    name: string;
    passwordHash: string;
  }>;

  console.log(`📊  Found ${bcryptUsers.length} user(s) with bcrypt hashes.`);

  if (bcryptUsers.length === 0) {
    console.log('🎉  No migration needed — all users already use argon2id.');
    await mongoose.disconnect();
    return;
  }

  let processed = 0;
  let errors    = 0;

  for (let i = 0; i < bcryptUsers.length; i += BATCH_SIZE) {
    const batch = bcryptUsers.slice(i, i + BATCH_SIZE);

    for (const user of batch) {
      try {
        const rawToken  = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        console.log(`  → ${DRY_RUN ? '[DRY] ' : ''}Processing user: ${user.email} (${user._id})`);

        if (!DRY_RUN) {
          await (User.findByIdAndUpdate as any)(user._id, {
            mustResetPassword:    true,
            mustResetReason:      'Your account security has been upgraded. Please reset your password to continue.',
            passwordResetToken:   tokenHash,
            passwordResetExpires: new Date(Date.now() + 7 * 24 * 3600_000), // 7 days
          });

          // Dynamically import enqueueEmail to avoid hard dependency on Redis at startup
          try {
            const { enqueueEmail } = await import('../src/lib/queue');
            await enqueueEmail({
              type:  'passwordReset',
              email: user.email,
              token: rawToken,
            });
          } catch (emailErr) {
            console.warn(`    ⚠️  Could not enqueue email for ${user.email}:`, emailErr);
            console.warn(`    Reset link (save this): /reset-password?token=${rawToken}`);
          }
        }

        processed++;
      } catch (err) {
        console.error(`  ❌  Failed to process ${user.email}:`, err);
        errors++;
      }
    }

    // Brief pause between batches to avoid SMTP rate limits
    if (i + BATCH_SIZE < bcryptUsers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅  Migration complete.`);
  console.log(`   Processed : ${processed}`);
  console.log(`   Errors    : ${errors}`);
  console.log(`   Dry run   : ${DRY_RUN}`);
  if (!DRY_RUN) {
    console.log(`\n⚠️   Password reset emails have been queued.`);
    console.log(`   These users must reset their password before logging in.`);
  }

  await mongoose.disconnect();
}

run().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
