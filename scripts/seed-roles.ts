#!/usr/bin/env tsx
// scripts/seed-roles.ts — HemaV055 feature port
//
// Seeds V055 RBAC roles and optionally promotes a user to admin.
// Adapted from V055 scripts/src/seed-roles.ts for MongoDB.
//
// Usage:
//   # Show all users and their roles:
//   DATABASE_URL=<mongo_uri> npx tsx scripts/seed-roles.ts
//
//   # Promote a user to admin by email:
//   DATABASE_URL=<mongo_uri> ADMIN_EMAIL=admin@example.com npx tsx scripts/seed-roles.ts
//
// Note: DATABASE_URL here refers to MONGODB_URI environment variable.

import mongoose from 'mongoose';

const ROLES = ['admin', 'moderator', 'user'] as const;

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI ?? process.env.DATABASE_URL;
  if (!mongoUri) {
    throw new Error('MONGODB_URI (or DATABASE_URL) environment variable is required');
  }

  await mongoose.connect(mongoUri);

  console.log('='.repeat(60));
  console.log('HemaV055 — RBAC Seed Script (MongoDB)');
  console.log('='.repeat(60));
  console.log('');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  // Verify users collection exists
  const collections = await db.listCollections({ name: 'users' }).toArray();
  if (collections.length === 0) {
    console.error('ERROR: users collection does not exist.');
    console.error('Run the app at least once to initialize the database.');
    process.exit(1);
  }

  console.log('✓ users collection found');

  // Show current users and their roles
  const users = await db
    .collection('users')
    .find({})
    .project({ email: 1, role: 1, roles: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .toArray();

  if (users.length === 0) {
    console.log('\nNo users found. Register users first via /api/auth/register');
  } else {
    console.log('\nCurrent users:');
    for (const u of users) {
      const v055Roles = (u.roles as string[] | undefined)?.join(', ') ?? '(none)';
      const legacyRole = (u.role as string | undefined) ?? '(none)';
      console.log(`  ${u.email as string} — roles: [${v055Roles}] | legacy role: ${legacyRole}`);
    }
  }

  // Seed 'roles' array for existing users who don't have it yet
  console.log('\nSeeding missing roles arrays for existing users...');
  let seeded = 0;
  for (const u of users) {
    const hasRoles = Array.isArray(u.roles) && (u.roles as string[]).length > 0;
    if (!hasRoles) {
      // Map legacy role to V055 role
      let v055Role = 'user';
      const legacyRole = u.role as string | undefined;
      if (legacyRole === 'admin') v055Role = 'admin';
      else if (legacyRole === 'manager' || legacyRole === 'staff') v055Role = 'moderator';

      await db
        .collection('users')
        .updateOne({ _id: u._id }, { $set: { roles: [v055Role] } });
      seeded++;
    }
  }
  if (seeded > 0) console.log(`✓ Seeded roles for ${seeded} user(s)`);
  else console.log('✓ All users already have roles arrays');

  // Optionally promote a user to admin
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    console.log(`\nPromoting ${adminEmail} to admin...`);

    const targetUser = await db
      .collection('users')
      .findOne({ email: adminEmail.toLowerCase() });

    if (!targetUser) {
      console.error(`ERROR: No user found with email "${adminEmail}"`);
      process.exit(1);
    }

    // Assign both 'user' and 'admin' roles (idempotent via $addToSet)
    await db.collection('users').updateOne(
      { _id: targetUser._id },
      {
        $addToSet: { roles: { $each: ['user', 'admin'] } },
        $set: { role: 'admin' }, // keep legacy field in sync
      },
    );

    console.log(`✓ ${adminEmail} is now an admin`);
  } else {
    console.log('\nTo promote a user to admin, re-run with: ADMIN_EMAIL=user@example.com');
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
