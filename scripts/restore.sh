#!/usr/bin/env bash
# scripts/restore.sh — HemaV063
# V063 FIX-LOW-06: Decrypt backup before restore.
# Usage: ./scripts/restore.sh <backup-file.tar.gz.enc> [--confirm]
set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <backup.tar.gz.enc> [--confirm]}"
CONFIRM="${2:-}"
RESTORE_DIR="/tmp/ehema-restore-$$"
MONGO_URI="${MONGODB_URI:?MONGODB_URI required}"

log()  { echo "[$(date -Iseconds)] $*"; }
error(){ echo "[$(date -Iseconds)] ERROR: $*" >&2; exit 1; }

[[ -f "$BACKUP_FILE" ]] || error "Backup file not found: $BACKUP_FILE"

log "=== EHema Restore ==="
log "Backup file: $BACKUP_FILE"
log "Target DB:   $MONGO_URI"

if [[ "$CONFIRM" != "--confirm" ]]; then
  log "⚠️  This will OVERWRITE the database. Run with --confirm to proceed."
  exit 1
fi

# ── V063 FIX-LOW-06: Decrypt backup before restore.
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  error "BACKUP_ENCRYPTION_KEY is not set. Cannot decrypt backup."
fi

ARCHIVE="${BACKUP_FILE%.enc}"
log "Decrypting backup..."
openssl enc -d -aes-256-gcm -salt -pbkdf2 -iter 600000 \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  -in "${BACKUP_FILE}" \
  -out "${ARCHIVE}"
log "Decrypted to: ${ARCHIVE}"

# Extract
log "Extracting backup..."
mkdir -p "$RESTORE_DIR"
tar -xzf "$ARCHIVE" -C "$RESTORE_DIR"
rm -f "$ARCHIVE"

# Find dump directory
DUMP_DIR=$(find "$RESTORE_DIR" -maxdepth 2 -name "*.bson" | head -1 | xargs dirname | xargs dirname)
[[ -d "$DUMP_DIR" ]] || error "Could not find dump directory in $RESTORE_DIR"

# Restore
log "Restoring to MongoDB..."
mongorestore \
  --uri="$MONGO_URI" \
  --dir="$DUMP_DIR" \
  --gzip \
  --drop \
  --quiet

rm -rf "$RESTORE_DIR"
log "=== Restore Complete ==="
