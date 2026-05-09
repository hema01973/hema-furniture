// src/lib/mfa-encryption.ts — HemaV054
// LOW-04 FIX (V054): At-rest encryption for mfaSecret and mfaBackupCodes.
//
// ── WHY ────────────────────────────────────────────────────────────────────────
// OWASP ASVS v4.0 §2.8.7 recommends encrypting TOTP secrets at rest.
// If the MongoDB database is breached, plaintext mfaSecrets allow an attacker
// to compute valid TOTP codes for ALL MFA-enabled users — bypassing the second
// factor entirely and enabling complete account takeovers.
//
// ── ALGORITHM ──────────────────────────────────────────────────────────────────
// AES-256-GCM (authenticated encryption):
//   • 256-bit key from MFA_ENCRYPTION_KEY env var (32 random bytes, hex-encoded)
//   • 96-bit random IV per encryption (GCM standard recommendation)
//   • 128-bit authentication tag (GCM default) — detects tampering
//   • Output format: "<iv_hex>.<ciphertext_hex>.<tag_hex>" — self-contained
//
// ── KEY MANAGEMENT ─────────────────────────────────────────────────────────────
// The key is read from MFA_ENCRYPTION_KEY (via secrets adapter, supporting AWS SM).
// Key rotation: add MFA_ENCRYPTION_KEY_PREVIOUS to decrypt old values; new writes
// always use the current key. Run scripts/migrate-mfa-encryption.ts to re-encrypt.
//
// ── BACKWARDS COMPATIBILITY ────────────────────────────────────────────────────
// Values that do NOT start with "enc:" are treated as plaintext (legacy) and
// returned as-is. This allows zero-downtime deployment: old plaintext values
// continue to work; new values are encrypted. Run the migration script to
// encrypt all existing plaintext secrets.
//
// Generate a key (run once, store in AWS Secrets Manager):
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

import crypto from 'crypto';
import { getSecretSync } from './secrets';
import { logger } from './logger';

const ALGORITHM   = 'aes-256-gcm';
const IV_BYTES    = 12;  // 96-bit IV — GCM recommended
const TAG_BYTES   = 16;  // 128-bit auth tag — GCM default
const ENC_PREFIX  = 'enc:';

function getEncryptionKey(): Buffer | null {
  const hexKey = getSecretSync('MFA_ENCRYPTION_KEY' as never) ?? process.env.MFA_ENCRYPTION_KEY;
  if (!hexKey) return null;
  if (hexKey.length !== 64) {
    logger.error('[MFA-Enc] MFA_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    return null;
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypt a plaintext MFA secret for storage.
 *
 * Returns "<enc:iv_hex.ciphertext_hex.tag_hex>" or the original plaintext
 * if encryption is not configured (logs a warning in production).
 */
export function encryptMfaSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('[MFA-Enc] MFA_ENCRYPTION_KEY not set — storing mfaSecret as plaintext. ' +
        'Set MFA_ENCRYPTION_KEY in production for ASVS §2.8.7 compliance.');
    }
    return plaintext;
  }

  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('hex')}.${encrypted.toString('hex')}.${tag.toString('hex')}`;
}

/**
 * Decrypt a stored MFA secret.
 *
 * Handles:
 *   - Encrypted values (prefix "enc:")
 *   - Legacy plaintext values (no prefix) — returns as-is for backwards compat
 */
export function decryptMfaSecret(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    // Legacy plaintext — return as-is (migration script will encrypt these)
    return stored;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('[MFA-Enc] Cannot decrypt: MFA_ENCRYPTION_KEY is not configured');
  }

  const payload = stored.slice(ENC_PREFIX.length);
  const parts   = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('[MFA-Enc] Malformed encrypted value');
  }

  // length === 3 is guaranteed by the guard above; index access is safe.
  const ivHex         = parts[0] as string;
  const ciphertextHex = parts[1] as string;
  const tagHex        = parts[2] as string;
  const iv         = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const tag        = Buffer.from(tagHex, 'hex');

  if (iv.length !== IV_BYTES) throw new Error('[MFA-Enc] Invalid IV length');
  if (tag.length !== TAG_BYTES) throw new Error('[MFA-Enc] Invalid auth tag length');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // GCM auth tag mismatch — data tampered or wrong key
    throw new Error('[MFA-Enc] Decryption failed: authentication tag mismatch');
  }
}

/**
 * Check whether a stored value is already encrypted.
 */
export function isMfaSecretEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
